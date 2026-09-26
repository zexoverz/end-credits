// Integration: the claim flow on real Postgres with a fake GitHub, a fake escrow and a scripted
// screen. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { sealData } from "iron-session";
import { getAddress, keccak256, stringToBytes, zeroAddress, type Address } from "viem";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seal } from "../crypto/seal";
import { fakeGitHub, type FakeGitHub } from "../github/__fixtures__/fake-github";
import { CLAIM_BRANCH, fundingJson } from "../github/claim";
import { msg } from "../messages";
import { packageKey } from "../payee/keys";
import type { Resolution } from "../payee/resolve";
import { fakeChain, scriptedScreen } from "./__fixtures__/fakes";
import type { ClaimDeps } from "./deps";
import { MAINT_COOKIE } from "./session";

const DB_URL = process.env.TEST_DATABASE_URL;
const APP = "https://credits.test";
const SECRET = "a-session-secret-that-is-32-bytes-long!!";
const WALLET = getAddress("0xa11ce00000000000000000000000000000000001");
const OTHER = getAddress("0xb0b0000000000000000000000000000000000002");

describe.skipIf(!DB_URL)("claim flow (integration)", () => {
  let handleClaim: typeof import("./http").handleClaim;
  let store: import("./store").ClaimStore;
  let db: typeof import("../db/client").db;
  let s: typeof import("../db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    ({ db } = await import("../db/client"));
    s = await import("../db/schema");
    ({ handleClaim } = await import("./http"));
    store = (await import("./store")).claimStore(db());
  });

  // One repo, one maintainer, fresh names per test.
  let gh: FakeGitHub;
  let chain: ReturnType<typeof fakeChain>;
  let screen: ReturnType<typeof scriptedScreen>;
  let payee: Resolution;
  let deps: ClaimDeps;
  let repo: string;
  let pkg: string;
  let cookie: string;
  let maintainerId: string;
  const TOKEN = "gho_maint";

  beforeEach(async () => {
    const id = randomUUID().slice(0, 8);
    repo = `acme-${id}/lib`;
    pkg = `@acme-${id}/lib`;
    gh = fakeGitHub();
    gh.addRepo(repo, { perms: { [TOKEN]: { admin: false, push: true, pull: true } } });
    chain = fakeChain();
    screen = scriptedScreen();
    payee = { address: null };
    maintainerId = await store.upsertMaintainer({
      githubId: Math.floor(Math.random() * 1e9),
      githubLogin: `octo-${id}`,
      tokenEnc: seal(TOKEN, SECRET),
    });
    cookie = `${MAINT_COOKIE}=${await sealData({ maintainerId }, { password: SECRET })}`;
    await db().insert(s.packages).values({ name: pkg, packageKey: packageKey(pkg), repoFullName: repo });
    deps = {
      store,
      secret: SECRET,
      appUrl: APP,
      githubFetch: gh.fetch,
      chain: chain.chain,
      screen: screen.screen,
      loadPackage: async (name) => {
        throw new Error(`unexpected registry load: ${name}`);
      },
      payeeOf: async () => payee,
    };
  });

  const call = async (action: string, method = "POST", body?: unknown, withCookie = true) => {
    const res = await handleClaim(
      new Request(`${APP}/api/claim/${pkg}/${action}`, {
        method,
        headers: {
          ...(withCookie ? { cookie } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      [...pkg.split("/"), action],
      deps,
    );
    return { status: res.status, body: await res.json() };
  };
  const setWallet = () => call("wallet", "POST", { address: WALLET.toLowerCase() });
  const claimRow = async () => (await store.latestClaim(repo, maintainerId))!;
  const setClaims = () => chain.calls.filter((c) => c.fn === "setClaim");

  describe("POST wallet", () => {
    it("401 without a maintainer session", async () => {
      expect((await call("wallet", "POST", { address: WALLET }, false)).status).toBe(401);
    });

    it("403 NO_PERMISSION without push or admin, and stores nothing", async () => {
      gh.repos[repo].perms[TOKEN] = { admin: false, push: false, pull: true };
      const r = await setWallet();
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("NO_PERMISSION");
      expect(r.body.message).toBe(msg("NO_PERMISSION", { repo, package: pkg }));
      expect(await store.latestClaim(repo, maintainerId)).toBeNull();
      expect(gh.calls.find((c) => c.path === `/repos/${repo}`)?.token).toBe(TOKEN);
    });

    it("accepts admin without push", async () => {
      gh.repos[repo].perms[TOKEN] = { admin: true, push: false, pull: true };
      expect((await setWallet()).status).toBe(200);
    });

    it("409 ALREADY_PAYABLE when the package already resolves to a payee", async () => {
      payee = { address: OTHER, source: "drips", sourceUrl: "x" };
      const r = await setWallet();
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("ALREADY_PAYABLE");
    });

    it("stores the checksummed wallet with status 'wallet'", async () => {
      const r = await setWallet();
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "wallet", repo, wallet: WALLET });
      expect(await claimRow()).toMatchObject({ status: "wallet", walletAddress: WALLET });
    });

    it("400 on an invalid address", async () => {
      expect((await call("wallet", "POST", { address: "0x1234" })).status).toBe(400);
    });
  });

  describe("POST pr", () => {
    it("opens the FUNDING.json PR", async () => {
      await setWallet();
      const r = await call("pr");
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "pr_open", prMode: "api", prNumber: 1, code: "PR_OPENED" });
      expect(r.body.message).toBe(msg("PR_OPENED", { number: 1 }));
      expect(gh.repos[repo].files[CLAIM_BRANCH]["FUNDING.json"]).toBe(fundingJson(WALLET));
    });

    it("falls back to the new-file link when GitHub answers 403", async () => {
      await setWallet();
      gh.fail[`POST /repos/${repo}/git/refs`] = 403;
      const r = await call("pr");
      expect(r.body).toMatchObject({ status: "pr_open", prMode: "new_file_link", code: "PR_LINK" });
      expect(r.body.prUrl).toContain(`https://github.com/${repo}/new/main?filename=FUNDING.json&value=`);
      expect((await claimRow()).prMode).toBe("new_file_link");
    });

    it("409 before a wallet is set", async () => {
      expect((await call("pr")).status).toBe(409);
    });
  });

  describe("status", () => {
    async function openAndMerge() {
      await setWallet();
      await call("pr");
      gh.merge(repo, 1);
    }

    it("waits while the PR is open, with no screen and no chain call", async () => {
      await setWallet();
      await call("pr");
      const r = await call("status", "GET");
      expect(r.body).toMatchObject({ status: "pr_open", code: "PR_WAITING" });
      expect(screen.screened).toHaveLength(0);
      expect(chain.calls).toHaveLength(0);
    });

    it("FUNDING_MISMATCH: the default branch names another address, no setClaim", async () => {
      await openAndMerge();
      gh.repos[repo].files.main["FUNDING.json"] = fundingJson(OTHER);
      chain.reserved.set(packageKey(pkg), 500_000n);
      const r = await call("status", "GET");
      expect(r.body.code).toBe("FUNDING_MISMATCH");
      expect(r.body.message).toBe(msg("FUNDING_MISMATCH", { branch: "main", found: OTHER, expected: WALLET }));
      expect(setClaims()).toHaveLength(0);
      expect(screen.screened).toHaveLength(0);
    });

    it("refused: a critical Intercepta trait stops the claim before setClaim", async () => {
      await openAndMerge();
      chain.reserved.set(packageKey(pkg), 500_000n);
      screen.result = {
        ok: true,
        toxicScore: 10,
        traits: [{ name: "sanction_address", description: "Sanctioned address" }],
        screenId: "",
      };
      const r = await call("status", "GET");
      expect(r.body).toMatchObject({ status: "refused", code: "CLAIM_REFUSED" });
      expect(r.body.message).toBe(msg("CLAIM_REFUSED", { description: "Sanctioned address" }));
      expect(setClaims()).toHaveLength(0);
      expect((await call("status", "GET")).body.status).toBe("refused");
      expect(screen.screened).toHaveLength(1);
    });

    it("refused: a toxic score over 50 stops the claim", async () => {
      await openAndMerge();
      chain.reserved.set(packageKey(pkg), 500_000n);
      screen.result = { ok: true, toxicScore: 51, traits: [], screenId: "" };
      const r = await call("status", "GET");
      expect(r.body.status).toBe("refused");
      expect(setClaims()).toHaveLength(0);
    });

    it("screen unavailable: fails closed, no setClaim, and retries on the next check", async () => {
      await openAndMerge();
      chain.reserved.set(packageKey(pkg), 500_000n);
      screen.result = { ok: false, error: "TIMEOUT" };
      const r = await call("status", "POST");
      expect(r.body).toMatchObject({ status: "verified", code: "SCREEN_UNAVAILABLE" });
      expect(setClaims()).toHaveLength(0);
      screen.result = { ok: true, toxicScore: 0, traits: [], screenId: "" };
      expect((await call("status", "POST")).body.status).toBe("claimed");
    });

    it("merged + match + clean: setClaim and claim for every reserved package of the repo, once", async () => {
      const second = `${pkg}-plugin`;
      const empty = `${pkg}-empty`;
      const elsewhere = `${pkg}-elsewhere`;
      await db().insert(s.packages).values([
        { name: second, packageKey: packageKey(second), repoFullName: repo },
        { name: empty, packageKey: packageKey(empty), repoFullName: repo },
        { name: elsewhere, packageKey: packageKey(elsewhere), repoFullName: `${repo}-fork` },
      ]);
      chain.reserved.set(packageKey(pkg), 500_000n);
      chain.reserved.set(packageKey(second), 250_000n);
      chain.reserved.set(packageKey(elsewhere), 999_000n);
      await openAndMerge();

      const r = await call("status", "GET");
      expect(r.body).toMatchObject({ status: "claimed", code: "CLAIMED", claimedAmount: "0.75" });
      expect((r.body as { claimTxs: string[] }).claimTxs).toHaveLength(2);
      expect((r.body as { setClaimTx: string | null }).setClaimTx).toMatch(/^0x/);
      expect(r.body.message).toBe(msg("CLAIMED", { amount: "0.75", address: WALLET }));
      const mergeSha = gh.repos[repo].pulls[0].mergeSha!;
      const evidence = keccak256(stringToBytes(repo + mergeSha));
      expect(setClaims().map((c) => [c.key, c.payee, c.evidence]).sort()).toEqual(
        [
          [packageKey(pkg), WALLET, evidence],
          [packageKey(second), WALLET, evidence],
        ].sort(),
      );
      expect(chain.calls.filter((c) => c.fn === "claim").map((c) => c.key).sort()).toEqual(
        [packageKey(pkg), packageKey(second)].sort(),
      );
      expect(chain.reserved.get(packageKey(elsewhere))).toBe(999_000n);
      const row = await claimRow();
      expect(row).toMatchObject({ status: "claimed", mergedSha: mergeSha, claimedMicro: 750_000n });
      expect(row.claimTxs).toHaveLength(2);
      const [m] = await db().select().from(s.maintainers).where(eq(s.maintainers.id, maintainerId));
      expect(m.tokenEnc).toBeNull();

      const again = await call("status", "GET");
      expect(again.body).toEqual(r.body);
      expect(chain.calls).toHaveLength(4);
    });

    it("new-file-link mode: the file on the default branch is the proof", async () => {
      await setWallet();
      gh.fail[`POST /repos/${repo}/git/refs`] = 403;
      await call("pr");
      chain.reserved.set(packageKey(pkg), 100_000n);
      expect((await call("status", "GET")).body.code).toBe("PR_LINK");
      gh.repos[repo].files.main["FUNDING.json"] = fundingJson(WALLET);
      const r = await call("status", "GET");
      expect(r.body).toMatchObject({ status: "claimed", claimedAmount: "0.1" });
      expect(setClaims()).toHaveLength(1);
    });

    it("COOLING: a changed claim is set but not paid out until the delay ends", async () => {
      chain.reserved.set(packageKey(pkg), 100_000n);
      chain.claims.set(packageKey(pkg), { payee: OTHER, changedAt: 0n, changed: false });
      await openAndMerge();
      const r = await call("status", "GET");
      expect(r.body).toMatchObject({ status: "verified", code: "COOLING" });
      expect(setClaims()).toHaveLength(1);
      expect(chain.calls.filter((c) => c.fn === "claim")).toHaveLength(0);
      expect(chain.claims.get(packageKey(pkg))?.payee).toBe(WALLET);
    });

    it("none before a claim is started", async () => {
      const r = await call("status", "GET");
      expect(r.body).toMatchObject({ status: "none" });
    });
  });

  it("the zero address is never a wallet", async () => {
    expect((await call("wallet", "POST", { address: zeroAddress as Address })).status).toBe(400);
  });
});
