// Integration: the /npm/<name> summary on real Postgres with a fake escrow. Skipped without
// TEST_DATABASE_URL.
import { randomUUID } from "node:crypto";
import { sealData } from "iron-session";
import { getAddress, keccak256, stringToBytes } from "viem";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seal } from "../crypto/seal";
import { msg } from "../messages";
import { packageKey } from "../payee/keys";
import type { Resolution } from "../payee/resolve";
import { CHANGE_DELAY, fakeChain, scriptedScreen } from "./__fixtures__/fakes";
import type { ClaimDeps } from "./deps";
import { MAINT_COOKIE } from "./session";

const DB_URL = process.env.TEST_DATABASE_URL;
const APP = "https://credits.test";
const SECRET = "a-session-secret-that-is-32-bytes-long!!";
const NOW = 1_800_000_000;
const FUNDED = getAddress("0xb0b0000000000000000000000000000000000002");

describe.skipIf(!DB_URL)("GET /api/npm/<name> summary (integration)", () => {
  let packageSummary: typeof import("./summary").packageSummary;
  let store: import("./store").ClaimStore;
  let db: typeof import("../db/client").db;
  let s: typeof import("../db/schema");

  let chain: ReturnType<typeof fakeChain>;
  let payee: Resolution;
  let deps: ClaimDeps;
  let pkg: string;
  let repo: string;
  let packageId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    ({ db } = await import("../db/client"));
    s = await import("../db/schema");
    ({ packageSummary } = await import("./summary"));
    store = (await import("./store")).claimStore(db());
  });

  // Two sessions reserved for the package, one paid it.
  async function seedCredits() {
    const [owner] = await db()
      .insert(s.owners)
      .values({ displayName: "t", payerAddress: "0x0000000000000000000000000000000000000001" })
      .returning();
    const [key] = await db()
      .insert(s.agentKeys)
      .values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" })
      .returning();
    for (const outcome of ["reserved", "reserved", "paid"] as const) {
      const id = randomUUID();
      const [session] = await db()
        .insert(s.sessions)
        .values({ ownerId: owner.id, agentKeyId: key.id, claudeSessionId: id, sessionKey: keccak256(stringToBytes(id)) })
        .returning();
      await db().insert(s.credits).values({
        sessionId: session.id,
        packageId,
        score: 1,
        amountMicro: 250_000n,
        role: "starring",
        outcome,
      });
    }
  }

  beforeEach(async () => {
    const id = randomUUID().slice(0, 8);
    pkg = `sum-${id}`;
    repo = `acme-${id}/sum`;
    chain = fakeChain(() => BigInt(NOW));
    payee = { address: null };
    const [row] = await db()
      .insert(s.packages)
      .values({
        name: pkg,
        packageKey: packageKey(pkg),
        repoFullName: repo,
        fundingLinks: ["https://github.com/sponsors/acme"],
      })
      .returning();
    packageId = row.id;
    deps = {
      store,
      secret: SECRET,
      appUrl: APP,
      chain: chain.chain,
      screen: scriptedScreen().screen,
      loadPackage: async (name) => {
        throw new Error(`not on npm: ${name}`);
      },
      payeeOf: async (_pkg, opts) => {
        expect(opts?.observe).toBe(false);
        return payee;
      },
      now: () => new Date(NOW * 1000),
    };
  });

  const get = async (name = pkg, cookie?: string) => {
    const res = await packageSummary(
      new Request(`${APP}/api/npm/${name}`, { headers: cookie ? { cookie } : {} }),
      name.split("/"),
      deps,
    );
    return { status: res.status, body: await res.json() };
  };

  it("reserved: CLAIM_HEADLINE with the on-chain amount and the reserving sessions", async () => {
    await seedCredits();
    chain.reserved.set(packageKey(pkg), 500_000n);
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      package: pkg,
      repo,
      state: "reserved",
      reserved: "0.5",
      sessions: 2,
      alsoAccepts: ["https://github.com/sponsors/acme"],
      alreadyPayable: null,
      cooling: null,
      claim: null,
    });
    expect(r.body.headline).toBe(msg("CLAIM_HEADLINE", { amount: "0.5", package: pkg, sessions: 2 }));
  });

  it("nothing reserved: no headline", async () => {
    const r = await get();
    expect(r.body).toMatchObject({ state: "nothing_reserved", reserved: "0", headline: null });
  });

  it("ALREADY_PAYABLE when the package resolves to a payee on its own", async () => {
    payee = { address: FUNDED, source: "drips", sourceUrl: "x" };
    const r = await get();
    expect(r.body.alreadyPayable).toBe(msg("ALREADY_PAYABLE", { package: pkg }));
    expect(r.body.payee).toEqual({ address: FUNDED, source: "drips" });
  });

  it("COOLING while a changed claim is inside the delay", async () => {
    const changedAt = BigInt(NOW - 3600);
    chain.claims.set(packageKey(pkg), { payee: FUNDED, changed: true, changedAt });
    const r = await get();
    const time = new Date(Number(changedAt + CHANGE_DELAY) * 1000).toISOString();
    expect(r.body.cooling).toEqual({ until: time, message: msg("COOLING", { time }) });
  });

  it("no COOLING once the delay has passed", async () => {
    chain.claims.set(packageKey(pkg), { payee: FUNDED, changed: true, changedAt: BigInt(NOW) - CHANGE_DELAY });
    expect((await get()).body.cooling).toBeNull();
  });

  it("shows the signed-in maintainer's claim", async () => {
    const maintainerId = await store.upsertMaintainer({
      githubId: Math.floor(Math.random() * 1e9),
      githubLogin: "octo",
      tokenEnc: seal("t", SECRET),
    });
    await store.insertClaim({ repoFullName: repo, maintainerId, status: "pr_open", walletAddress: FUNDED, prMode: "api", prNumber: 3 });
    const cookie = `${MAINT_COOKIE}=${await sealData({ maintainerId }, { password: SECRET })}`;
    const r = await get(pkg, cookie);
    expect(r.body.maintainer).toEqual({ login: "octo" });
    expect(r.body.claim).toMatchObject({ status: "pr_open", wallet: FUNDED, prNumber: 3 });
    expect(r.body.state).toBe("in_progress");
  });

  it("reports a chain read failure instead of inventing an amount", async () => {
    chain.chain.reserved = async () => {
      throw new Error("rpc down");
    };
    const r = await get();
    expect(r.body).toMatchObject({ reserved: null, headline: null, errors: ["chain"] });
  });

  it("404 for a package neither we nor npm know", async () => {
    expect((await get(`nope-${randomUUID().slice(0, 8)}`)).status).toBe(404);
  });

  it("400 for an invalid name", async () => {
    expect((await get("..")).status).toBe(400);
  });
});
