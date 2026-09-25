// Integration: real Postgres, fake chain. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { eq } from "drizzle-orm";
import { keccak256, type Hex } from "viem";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { TxRevertedError } from "../chain/txqueue";
import { msg } from "../messages";
import {
  connect,
  fakeChain,
  HELD_TEXT,
  makeOwner,
  PAYEE,
  req,
  seedHold,
  signInCookie,
  TEST_DB,
} from "../__fixtures__/owner-db";

type Conn = Awaited<ReturnType<typeof connect>>;

describe.skipIf(!TEST_DB)("approve and deny (integration)", () => {
  let h: typeof import("./handlers");
  let db: Conn["db"];
  let s: Conn["s"];
  let ownerId: string;
  let cookie: string;

  beforeAll(async () => {
    ({ db, s } = await connect());
    ownerId = await makeOwner(db, s);
    cookie = await signInCookie(ownerId);
    h = await import("./handlers");
  });
  afterEach(() => {
    delete process.env.WORLD_REQUIRED;
  });

  const start = (tipId: string, chain: ReturnType<typeof fakeChain>, c: string | undefined = cookie) =>
    h.handleApproveStart(req(`/api/approve/${tipId}/start`, { method: "POST", cookie: c }), tipId, { chain });
  const deny = (tipId: string, chain: ReturnType<typeof fakeChain>, c: string | undefined = cookie) =>
    h.handleDeny(req(`/api/approve/${tipId}/deny`, { method: "POST", cookie: c }), tipId, { chain });
  const rows = async (tipId: Hex) => {
    const [hold] = await db.select().from(s.holds).where(eq(s.holds.tipId, tipId));
    const [credit] = await db.select().from(s.credits).where(eq(s.credits.id, hold.creditId));
    const approvals = await db.select().from(s.approvals).where(eq(s.approvals.holdId, hold.id));
    return { hold, credit, approvals };
  };

  it("approve releases, marks the credit paid and appends APPROVED_SESSION", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const res = await start(seeded.tipId, chain);
    expect(res.status).toBe(200);
    expect(chain.calls.release).toHaveLength(1);
    const [tipId, approvalRef] = chain.calls.release[0];
    expect(tipId).toBe(seeded.tipId);

    const { hold, credit, approvals } = await rows(seeded.tipId);
    const releaseTx = (await res.json()).releaseTx;
    expect(hold.status).toBe("released");
    expect(hold.releaseTx).toBe(releaseTx);
    expect(hold.resolvedAt).toBeInstanceOf(Date);
    expect(credit.outcome).toBe("paid");
    expect(credit.txHash).toBe(releaseTx);
    const approved = msg("APPROVED_SESSION", { amount: "0.15", address: PAYEE });
    expect(credit.reasons).toEqual([
      { source: "payee", code: "HELD_CHANGED", text: HELD_TEXT },
      { source: "owner", code: "APPROVED_SESSION", text: approved },
    ]);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ method: "session", status: "approved", ownerId });
    expect(keccak256(approvals[0].nonce as Hex)).toBe(approvalRef);
  });

  it("a second approve is 409 and releases nothing", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    expect((await start(seeded.tipId, chain)).status).toBe(200);
    const again = await start(seeded.tipId, chain);
    expect(again.status).toBe(409);
    expect(chain.calls.release).toHaveLength(1);
  });

  it("concurrent approves release once", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const results = await Promise.all([1, 2, 3].map(() => start(seeded.tipId, chain)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(chain.calls.release).toHaveLength(1);
  });

  it("approve after expiry is 410 and releases nothing", async () => {
    const seeded = await seedHold(db, s, ownerId, { expiresAt: new Date(Date.now() - 1000) });
    const chain = fakeChain();
    const res = await start(seeded.tipId, chain);
    expect(res.status).toBe(410);
    expect(chain.calls.release).toHaveLength(0);
    const { hold, credit } = await rows(seeded.tipId);
    expect(hold.status).toBe("pending");
    expect(credit.outcome).toBe("held");
  });

  it("WORLD_REQUIRED=true: session approve is 403 and releases nothing", async () => {
    process.env.WORLD_REQUIRED = "true";
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const res = await start(seeded.tipId, chain);
    expect(res.status).toBe(403);
    expect(chain.calls.release).toHaveLength(0);
    expect((await rows(seeded.tipId)).hold.status).toBe("pending");
  });

  it("401 without an owner session, for approve and deny", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    expect((await start(seeded.tipId, chain, "")).status).toBe(401);
    expect((await deny(seeded.tipId, chain, "")).status).toBe(401);
    expect(chain.calls.release).toHaveLength(0);
    expect(chain.calls.refund).toHaveLength(0);
  });

  it("another owner's hold is 404 for approve and deny", async () => {
    const other = await makeOwner(db, s);
    const seeded = await seedHold(db, s, other);
    const chain = fakeChain();
    expect((await start(seeded.tipId, chain)).status).toBe(404);
    expect((await deny(seeded.tipId, chain)).status).toBe(404);
    expect(chain.calls.release).toHaveLength(0);
    expect(chain.calls.refund).toHaveLength(0);
  });

  it("a chain failure leaves the hold pending and records a failed approval", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    chain.fail = new TxRevertedError("release", "TipExpired");
    const res = await start(seeded.tipId, chain);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "chain_error", code: "TipExpired" });
    const { hold, credit, approvals } = await rows(seeded.tipId);
    expect(hold.status).toBe("pending");
    expect(credit.outcome).toBe("held");
    expect(approvals.map((a) => [a.status, a.failureCode])).toEqual([["failed", "TipExpired"]]);
  });

  it("deny refunds, marks the hold denied, keeps the outcome held and appends DENIED", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const res = await deny(seeded.tipId, chain);
    expect(res.status).toBe(200);
    expect(chain.calls.refund).toEqual([seeded.tipId]);
    const { hold, credit } = await rows(seeded.tipId);
    expect(hold.status).toBe("denied");
    expect(hold.refundTx).toBe((await res.json()).refundTx);
    expect(credit.outcome).toBe("held");
    expect(credit.txHash).toBe("0xhold");
    expect(credit.reasons).toEqual([
      { source: "payee", code: "HELD_CHANGED", text: HELD_TEXT },
      { source: "owner", code: "DENIED", text: msg("DENIED", { amount: "0.15" }) },
    ]);
    expect((await deny(seeded.tipId, chain)).status).toBe(409);
    expect((await start(seeded.tipId, chain)).status).toBe(409);
    expect(chain.calls.refund).toHaveLength(1);
    expect(chain.calls.release).toHaveLength(0);
  });

  it("deny after expiry is 410 (the expirer refunds)", async () => {
    const seeded = await seedHold(db, s, ownerId, { expiresAt: new Date(Date.now() - 1000) });
    const chain = fakeChain();
    expect((await deny(seeded.tipId, chain)).status).toBe(410);
    expect(chain.calls.refund).toHaveLength(0);
  });

  it("404 for a malformed or unknown tip id", async () => {
    const chain = fakeChain();
    expect((await start("0x12", chain)).status).toBe(404);
    expect((await start(`0x${"ab".repeat(32)}`, chain)).status).toBe(404);
  });

  describe("GET view", () => {
    const view = (tipId: string, c?: string) =>
      h.handleApproveView(req(`/api/approve/${tipId}`, { cookie: c }), tipId);

    it("shows the hold with the full payee and the approve sentence", async () => {
      const seeded = await seedHold(db, s, ownerId);
      const res = await view(seeded.tipId, cookie);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        tipId: seeded.tipId,
        package: seeded.packageName,
        amount: "0.15",
        payee: PAYEE,
        reason: HELD_TEXT,
        sentence: msg("APPROVE_SENTENCE", { amount: "0.15", address: PAYEE, package: seeded.packageName }),
        status: "pending",
        worldRequired: false,
        signedIn: true,
        isOwner: true,
        txHash: null,
        message: null,
      });
      expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    });

    it("reports expired and approved states", async () => {
      const old = await seedHold(db, s, ownerId, { expiresAt: new Date(Date.now() - 1000) });
      expect((await (await view(old.tipId)).json()).status).toBe("expired");
      const seeded = await seedHold(db, s, ownerId);
      await start(seeded.tipId, fakeChain());
      const body = await (await view(seeded.tipId)).json();
      expect(body.status).toBe("approved");
      expect(body.signedIn).toBe(false);
      expect(body.message).toBe(msg("APPROVED_SESSION", { amount: "0.15", address: PAYEE }));
      expect(body.txHash).toMatch(/^0x/);
    });

    it("404 for an unknown tip", async () => {
      expect((await view(`0x${"cd".repeat(32)}`)).status).toBe(404);
    });
  });
});
