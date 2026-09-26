// Integration: a refunded tip goes back to the owner's budget wallet (real Postgres, fake chain).
// Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { eq } from "drizzle-orm";
import type { Address, Hash, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import { connect, fakeChain, makeOwner, seedHold, TEST_DB } from "../__fixtures__/owner-db";
import { msg } from "../messages";

type Conn = Awaited<ReturnType<typeof connect>>;
const PULL_TX = `0x${"05".repeat(32)}`;
const randomAddress = () => privateKeyToAccount(generatePrivateKey()).address;

describe.skipIf(!TEST_DB)("return to the owner's wallet (integration)", () => {
  let db: Conn["db"];
  let s: Conn["s"];
  let actions: typeof import("../approve/actions");
  let expire: typeof import("./expire");

  beforeAll(async () => {
    ({ db, s } = await connect());
    actions = await import("../approve/actions");
    expire = await import("./expire");
  });

  /** A held tip of an owner with a budget wallet; `funded` gives the session a pull. */
  async function seed(o: { funded?: boolean; expired?: boolean; amount?: bigint } = {}) {
    const ownerId = await makeOwner(db, s);
    const wallet = randomAddress();
    const funded = o.funded ?? true;
    await db.update(s.owners).set({ budgetOwner: wallet }).where(eq(s.owners.id, ownerId));
    const h = await seedHold(db, s, ownerId, {
      amountMicro: o.amount ?? BigInt(150_000),
      expiresAt: o.expired ? new Date(Date.now() - 1000) : undefined,
    });
    await db.update(s.sessions).set({ budgetPullTx: funded ? PULL_TX : null }).where(eq(s.sessions.id, h.sessionId));
    return { ...h, ownerId, wallet };
  }

  function returns(fail = false) {
    const sent: [Address, bigint][] = [];
    let n = 0;
    const r = {
      sent,
      fail,
      async returnToOwner(owner: Address, amount: bigint): Promise<Hash> {
        if (r.fail) throw new Error("rpc down");
        sent.push([owner, amount]);
        return `0x${(0xe0 + ++n).toString(16).padStart(64, "0")}` as Hash;
      },
    };
    return r;
  }

  const rows = async (holdId: string) => {
    const [hold] = await db.select().from(s.holds).where(eq(s.holds.id, holdId));
    const [credit] = await db.select().from(s.credits).where(eq(s.credits.id, hold.creditId));
    return { hold, credit, codes: (credit.reasons as { code: string }[]).map((r) => r.code) };
  };
  const returned = (amount: string) => ({ source: "policy", code: "RETURNED", text: msg("RETURNED", { amount }) });

  it("deny on a funded session refunds, then returns the exact tip to the owner's wallet", async () => {
    const h = await seed({ amount: BigInt(150_000) });
    const r = returns();
    const res = await actions.denyHold(h.ownerId, h.tipId, { ...fakeChain(), returnToOwner: r.returnToOwner });
    expect(res).toMatchObject({ ok: true });
    expect(r.sent).toEqual([[h.wallet, BigInt(150_000)]]);
    const { hold, credit } = await rows(h.holdId);
    expect(hold.status).toBe("denied");
    expect(hold.refundTx).toBeTruthy();
    expect(hold.returnTx).toMatch(/^0x0+e1$/);
    expect(credit.reasons).toEqual(expect.arrayContaining([returned("0.15")]));
  });

  it("expiry on a funded session refunds, then returns the exact tip", async () => {
    const h = await seed({ expired: true, amount: BigInt(120_000) });
    const r = returns();
    await expire.expireHolds({ database: db, refund: async () => PULL_TX as Hash, returnToOwner: r.returnToOwner });
    expect(r.sent).toEqual([[h.wallet, BigInt(120_000)]]);
    const { hold, credit, codes } = await rows(h.holdId);
    expect(hold.status).toBe("expired");
    expect(hold.returnTx).toMatch(/^0x0+e1$/);
    expect(codes.slice(-2)).toEqual(["EXPIRED", "RETURNED"]);
    expect(credit.reasons).toEqual(expect.arrayContaining([returned("0.12")]));
  });

  it("returns nothing when the session was not funded by a pull", async () => {
    const denied = await seed({ funded: false });
    const expired = await seed({ funded: false, expired: true });
    const r = returns();
    await actions.denyHold(denied.ownerId, denied.tipId, { ...fakeChain(), returnToOwner: r.returnToOwner });
    await expire.expireHolds({ database: db, refund: async () => PULL_TX as Hash, returnToOwner: r.returnToOwner });
    expect(r.sent.filter(([o]) => o === denied.wallet || o === expired.wallet)).toEqual([]);
    for (const id of [denied.holdId, expired.holdId]) {
      const { hold, codes } = await rows(id);
      expect(hold.returnTx).toBeNull();
      expect(codes).not.toContain("RETURN_PENDING");
      expect(codes).not.toContain("RETURNED");
    }
  });

  it("keeps the refund when the return fails, says RETURN_PENDING, and the expirer sends it once", async () => {
    const h = await seed({ amount: BigInt(90_000) });
    const r = returns(true);
    const lines: string[] = [];
    const res = await actions.denyHold(h.ownerId, h.tipId, { ...fakeChain(), returnToOwner: r.returnToOwner, log: (l) => lines.push(l) });
    expect(res).toMatchObject({ ok: true });
    let row = await rows(h.holdId);
    expect(row.hold.status).toBe("denied");
    expect(row.hold.refundTx).toBeTruthy();
    expect(row.hold.returnTx).toBeNull();
    expect(row.codes).toContain("RETURN_PENDING");
    expect(lines.join("\n")).toContain(h.holdId);

    r.fail = false;
    const deps = { database: db, refund: async () => PULL_TX as Hash, returnToOwner: r.returnToOwner };
    await expire.retryReturns(deps);
    await expire.retryReturns(deps);
    expect(r.sent.filter(([o]) => o === h.wallet)).toEqual([[h.wallet, BigInt(90_000)]]);
    row = await rows(h.holdId);
    expect(row.hold.returnTx).toMatch(/^0x/);
    expect(row.codes.filter((c) => c === "RETURNED")).toHaveLength(1);
    expect(row.codes.filter((c) => c === "RETURN_PENDING")).toHaveLength(1);
  });

  it("a second failed retry does not repeat RETURN_PENDING", async () => {
    const h = await seed({ expired: true });
    const r = returns(true);
    const deps = { database: db, refund: async () => PULL_TX as Hash, returnToOwner: r.returnToOwner };
    await expire.expireHolds(deps);
    await expire.retryReturns(deps);
    const { codes, hold } = await rows(h.holdId);
    expect(hold.status).toBe("expired");
    expect(codes.filter((c) => c === "RETURN_PENDING")).toHaveLength(1);
  });

  it("the expirer retries a settled session's leftover once", async () => {
    const h = await seed();
    await db.update(s.sessions).set({ leftoverMicro: BigInt(70_000) }).where(eq(s.sessions.id, h.sessionId));
    const r = returns();
    const deps = { database: db, refund: async () => PULL_TX as Hash, returnToOwner: r.returnToOwner };
    await expire.retryReturns(deps);
    await expire.retryReturns(deps);
    expect(r.sent.filter(([o]) => o === h.wallet)).toEqual([[h.wallet, BigInt(70_000)]]);
    const [session] = await db.select().from(s.sessions).where(eq(s.sessions.id, h.sessionId));
    expect(session.returnTx).toMatch(/^0x/);
  });

  it("a session leftover already returned is not sent again, even when asked directly", async () => {
    const h = await seed();
    await db.update(s.sessions).set({ leftoverMicro: BigInt(40_000) }).where(eq(s.sessions.id, h.sessionId));
    const { returnSessionLeftover } = await import("./return");
    const r = returns();
    expect(await returnSessionLeftover(db, h.sessionId, r)).toMatch(/^0x/);
    expect(await returnSessionLeftover(db, h.sessionId, r)).toBeNull();
    expect(r.sent.filter(([o]) => o === h.wallet)).toEqual([[h.wallet, BigInt(40_000)]]);
  });

  it("leaves a session leftover alone when the session was not funded", async () => {
    const h = await seed({ funded: false });
    await db.update(s.sessions).set({ leftoverMicro: BigInt(70_000) }).where(eq(s.sessions.id, h.sessionId));
    const r = returns();
    await expire.retryReturns({ database: db, refund: async () => PULL_TX as Hash, returnToOwner: r.returnToOwner });
    expect(r.sent.filter(([o]) => o === h.wallet)).toEqual([]);
  });
});
