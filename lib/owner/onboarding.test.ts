// Integration: real Postgres. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { keccak256, stringToBytes, zeroAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APPROVER, connect, makeOwner, req, signInCookie, TEST_DB } from "../__fixtures__/owner-db";
import type { Onboarding, OnboardingDeps } from "./onboarding";

type Conn = Awaited<ReturnType<typeof connect>>;

// A fresh wallet per run: `wallet_address` is unique and the test DB is reused.
const WALLET = privateKeyToAccount(generatePrivateKey()).address;

describe.skipIf(!TEST_DB)("owner onboarding (integration)", () => {
  let h: typeof import("./handlers");
  let keys: typeof import("./keys");
  let db: Conn["db"];
  let s: Conn["s"];
  let ownerId: string;
  let cookie: string;
  let approver: Address;
  const deps: OnboardingDeps = { approverOf: async () => approver };

  beforeEach(async () => {
    ({ db, s } = await connect());
    ownerId = await makeOwner(db, s, { approver: null });
    cookie = await signInCookie(ownerId);
    h = await import("./handlers");
    keys = await import("./keys");
    approver = zeroAddress;
  });
  afterEach(() => {
    delete process.env.BUDGET_ADDRESS;
  });

  const get = async (d: OnboardingDeps = deps): Promise<Onboarding> => {
    const res = await h.handleOnboarding(req("/api/owner/onboarding", { cookie }), d);
    expect(res.status).toBe(200);
    return res.json();
  };
  const step = (body: Onboarding, id: string) => body.steps.find((x) => x.id === id);

  it("401 without an owner session", async () => {
    expect((await h.handleOnboarding(req("/api/owner/onboarding"), deps)).status).toBe(401);
  });

  it("a new owner: signed in and budget done, the rest to do, next is wallet_bound", async () => {
    const body = await get();
    expect(body).toEqual({
      steps: [
        { id: "signed_in", done: true, detail: null, href: null },
        { id: "wallet_bound", done: false, detail: null, href: null },
        {
          id: "budget_set",
          done: true,
          detail: "2 USDC per session, 0.25 per package, 20 per day",
          href: "/app/owner#budget",
        },
        { id: "approver_set", done: false, detail: null, href: "/app/owner#approver" },
        { id: "spend_allowance", done: false, detail: "coming soon", href: "/app/owner#allowance" },
        { id: "agent_key", done: false, detail: null, href: "/app/owner#keys" },
        { id: "first_session", done: false, detail: null, href: null },
      ],
      next: "wallet_bound",
    });
  });

  it("steps follow the DB and the chain", async () => {
    await db.update(s.owners).set({ walletAddress: WALLET, sessionBudgetMicro: BigInt(3_500_000) }).where(eq(s.owners.id, ownerId));
    approver = APPROVER.address;
    const key = await keys.createKey(ownerId, "laptop");
    const sessionId = randomUUID();
    await db.insert(s.sessions).values({
      id: sessionId,
      ownerId,
      agentKeyId: key.id,
      claudeSessionId: randomUUID(),
      sessionKey: keccak256(stringToBytes(sessionId)),
    });
    const body = await get();
    expect(step(body, "wallet_bound")).toMatchObject({ done: true, detail: WALLET });
    expect(step(body, "budget_set")?.detail).toBe("3.5 USDC per session, 0.25 per package, 20 per day");
    expect(step(body, "approver_set")).toMatchObject({ done: true, detail: APPROVER.address });
    expect(step(body, "agent_key")).toMatchObject({ done: true });
    expect(step(body, "first_session")).toMatchObject({ done: true, href: `/app/credits/${sessionId}` });
    expect(body.next).toBe("spend_allowance");
  });

  it("a revoked key does not count", async () => {
    const key = await keys.createKey(ownerId, "old");
    await keys.revokeKey(ownerId, key.id);
    expect(step(await get(), "agent_key")).toMatchObject({ done: false });
  });

  it("a failed approver read is not done", async () => {
    const body = await get({ approverOf: () => Promise.reject(new Error("rpc down")) });
    expect(step(body, "approver_set")).toMatchObject({ done: false, detail: "chain unavailable" });
  });

  it("with BUDGET_ADDRESS set, the allowance reader decides spend_allowance", async () => {
    process.env.BUDGET_ADDRESS = "0x00000000000000000000000000000000000000cc";
    expect(step(await get(), "spend_allowance")).toMatchObject({ done: false, detail: null });
    const read = async () => BigInt(5_000_000);
    expect(step(await get({ ...deps, readSpendAllowance: read }), "spend_allowance")).toMatchObject({
      done: true,
      detail: "5 USDC",
    });
  });
});
