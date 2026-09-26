// Integration: real Postgres and real SIWE signatures from local keys. Skipped without TEST_DATABASE_URL.
import { eq, ne } from "drizzle-orm";
import { verifyMessage, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APP, connect, devOwner, req, TEST_DB } from "../__fixtures__/owner-db";
import { payerAddressFor } from "../chain/payers";
import type { WalletAuthDeps } from "./wallet";

type Conn = Awaited<ReturnType<typeof connect>>;

const OWNER_KEY = privateKeyToAccount(`0x${"a1".repeat(32)}`);
const OTHER_KEY = privateKeyToAccount(`0x${"b2".repeat(32)}`);
const DOMAIN = new URL(APP).host;

describe.skipIf(!TEST_DB)("wallet sign-in (integration)", () => {
  let w: typeof import("./wallet");
  let auth: typeof import("./owner");
  let db: Conn["db"];
  let s: Conn["s"];
  let ownerId: string;
  let approver: Address;

  const deps: WalletAuthDeps = {
    verify: (p) => verifyMessage(p),
    approverOf: async () => approver,
    newPayer: (id) => payerAddressFor(id, { PAYER_PRIVATE_KEY: `0x${"c3".repeat(32)}` }),
  };

  beforeAll(async () => {
    ({ db, s } = await connect());
    ownerId = await devOwner(db, s);
    w = await import("./wallet");
    auth = await import("./owner");
  });
  beforeEach(async () => {
    approver = zeroAddress;
    await db.delete(s.owners).where(ne(s.owners.id, ownerId));
    await db.update(s.owners).set({ walletAddress: null });
  });
  afterEach(() => {
    delete process.env.WORLD_REQUIRED;
    delete process.env.WORLD_SIGNIN;
  });

  const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

  async function nonce(): Promise<{ nonce: string; cookie: string }> {
    const res = await w.handleWalletNonce(req("/api/auth/wallet/nonce", { method: "POST" }));
    expect(res.status).toBe(200);
    const { nonce } = await res.json();
    return { nonce, cookie: cookieOf(res) };
  }

  async function signed(
    account: PrivateKeyAccount,
    n: string,
    over: Partial<Parameters<typeof createSiweMessage>[0]> = {},
    signer: PrivateKeyAccount = account,
  ): Promise<{ message: string; signature: Hex }> {
    const message = createSiweMessage({
      domain: DOMAIN,
      address: account.address,
      statement: "Sign in to End Credits",
      uri: APP,
      version: "1",
      chainId: 84532,
      nonce: n,
      ...over,
    });
    return { message, signature: await signer.signMessage({ message }) };
  }

  const login = (body: unknown, cookie: string, d: WalletAuthDeps = deps) =>
    w.handleWalletLogin(req("/api/auth/wallet", { method: "POST", body: JSON.stringify(body), cookie }), d);

  async function signIn(account: PrivateKeyAccount, over = {}, signer = account) {
    const n = await nonce();
    return login(await signed(account, n.nonce, over, signer), n.cookie);
  }

  const expectError = async (res: Response, error: string, status = 401) => {
    expect(await res.json()).toEqual({ error });
    expect(res.status).toBe(status);
  };

  const walletOf = async () =>
    (await db.select().from(s.owners).where(eq(s.owners.id, ownerId)))[0].walletAddress;

  it("first sign-in with no approver set binds the wallet and sets the owner cookie", async () => {
    const res = await signIn(OWNER_KEY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ownerId, wallet: OWNER_KEY.address });
    expect(await walletOf()).toBe(OWNER_KEY.address);
    expect(await auth.requireOwner(req("/", { cookie: cookieOf(res) }))).toEqual({ ownerId });
  });

  it("a bound wallet signs in again", async () => {
    expect((await signIn(OWNER_KEY)).status).toBe(200);
    expect((await signIn(OWNER_KEY)).status).toBe(200);
  });

  it("replaying a spent nonce with its original cookie is bad_nonce", async () => {
    const n = await nonce();
    const body = await signed(OWNER_KEY, n.nonce);
    expect((await login(body, n.cookie)).status).toBe(200);
    await expectError(await login(body, n.cookie), "bad_nonce");
  });

  it("a nonce that is not the cookie's, or no cookie, is bad_nonce", async () => {
    const n = await nonce();
    await expectError(await login(await signed(OWNER_KEY, `${n.nonce}x`), n.cookie), "bad_nonce");
    await expectError(await login(await signed(OWNER_KEY, n.nonce), ""), "bad_nonce");
  });

  it("a nonce past its 10 minutes is bad_nonce", async () => {
    const n = await nonce();
    const later = new Date(Date.now() + 11 * 60_000);
    const body = await signed(OWNER_KEY, n.nonce, { issuedAt: later });
    await expectError(await login(body, n.cookie, { ...deps, now: () => later }), "bad_nonce");
  });

  it("another domain, uri origin or chain is bad_domain", async () => {
    await expectError(await signIn(OWNER_KEY, { domain: "evil.test" }), "bad_domain");
    await expectError(await signIn(OWNER_KEY, { uri: "https://evil.test" }), "bad_domain");
    await expectError(await signIn(OWNER_KEY, { chainId: 8453 }), "bad_domain");
    expect(await walletOf()).toBeNull();
  });

  it("a signature from another key is bad_signature", async () => {
    await expectError(await signIn(OWNER_KEY, {}, OTHER_KEY), "bad_signature");
    expect(await walletOf()).toBeNull();
  });

  it("an old issuedAt or a passed expirationTime is expired", async () => {
    await expectError(await signIn(OWNER_KEY, { issuedAt: new Date(Date.now() - 11 * 60_000) }), "expired");
    await expectError(await signIn(OWNER_KEY, { expirationTime: new Date(Date.now() - 1000) }), "expired");
  });

  const ownerOf = async (address: Address) =>
    (await db.select().from(s.owners).where(eq(s.owners.walletAddress, address)))[0];

  it("another wallet after binding becomes a new owner with its own payer", async () => {
    expect((await signIn(OWNER_KEY)).status).toBe(200);
    const res = await signIn(OTHER_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ownerId).not.toBe(ownerId);
    const other = await ownerOf(OTHER_KEY.address);
    expect(other.id).toBe(body.ownerId);
    expect(other.payerAddress).toBe(deps.newPayer(other.id));
    expect(await auth.requireOwner(req("/", { cookie: cookieOf(res) }))).toEqual({ ownerId: other.id });
    expect(await walletOf()).toBe(OWNER_KEY.address);
  });

  it("the new owner signs in again as itself", async () => {
    const first = await (await signIn(OTHER_KEY)).json();
    approver = OWNER_KEY.address;
    const again = await (await signIn(OTHER_KEY)).json();
    expect(again.ownerId).toBe(first.ownerId);
  });

  it("a wallet that is not the first owner's on-chain approver gets its own owner, not the first", async () => {
    approver = OTHER_KEY.address;
    const res = await signIn(OWNER_KEY);
    expect(res.status).toBe(200);
    expect((await res.json()).ownerId).not.toBe(ownerId);
    expect(await walletOf()).toBeNull();
    expect((await signIn(OTHER_KEY)).status).toBe(200);
    expect(await walletOf()).toBe(OTHER_KEY.address);
  });

  it("a failed chain read refuses to bind", async () => {
    const res = await (async () => {
      const n = await nonce();
      const d = { ...deps, approverOf: () => Promise.reject(new Error("rpc down")) };
      return login(await signed(OWNER_KEY, n.nonce), n.cookie, d);
    })();
    await expectError(res, "chain_error", 502);
    expect(await walletOf()).toBeNull();
  });

  it("a malformed body is invalid_body", async () => {
    const n = await nonce();
    await expectError(await login({ message: "hi", signature: "nope" }, n.cookie), "invalid_body", 400);
  });

  describe("GET /api/auth/methods", () => {
    const methods = async () => (await import("./dev")).handleAuthMethods().json();

    it("wallet on, dev on with a token, world off", async () => {
      expect(await methods()).toEqual({ wallet: true, dev: true, world: false });
    });

    it("dev off when World is required, world on only when opted in", async () => {
      process.env.WORLD_REQUIRED = "true";
      process.env.WORLD_SIGNIN = "true";
      expect(await methods()).toEqual({ wallet: true, dev: false, world: true });
    });
  });
});
