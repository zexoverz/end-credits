// Integration: real Postgres, fake chain. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { TxRevertedError } from "../chain/txqueue";
import { msg } from "../messages";
import { ISSUER, worldEnv } from "../world/__fixtures__/idp";
import { approvalRefFor } from "./typed-data";
import {
  APPROVER,
  connect,
  ESCROW,
  fakeChain,
  HELD_TEXT,
  makeOwner,
  PAYEE,
  req,
  seedHold,
  signInCookie,
  signPrepared,
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

  type Chain = ReturnType<typeof fakeChain>;
  const post = (path: string, c: string | undefined, body?: unknown) =>
    req(path, { method: "POST", cookie: c, body: body === undefined ? undefined : JSON.stringify(body) });
  const prepare = (tipId: string, chain: Chain, c: string | undefined = cookie) =>
    h.handleApprovePrepare(post(`/api/approve/${tipId}/prepare`, c), tipId, { chain });
  const sign = (tipId: string, chain: Chain, body: unknown, c: string | undefined = cookie) =>
    h.handleApproveSignature(post(`/api/approve/${tipId}/signature`, c, body), tipId, { chain });
  /** prepare → sign with the approver → store; a random id when prepare is refused. */
  async function signedId(tipId: string, chain: Chain, c: string | undefined = cookie): Promise<string> {
    const p = await prepare(tipId, chain, c);
    if (p.status !== 200) return randomUUID();
    const { approvalId, typedData } = await p.json();
    const r = await sign(tipId, chain, { approvalId, signature: await signPrepared(typedData) }, c);
    expect(r.status).toBe(200);
    return approvalId;
  }
  const start = async (tipId: string, chain: Chain, c: string | undefined = cookie, approvalId?: string) =>
    h.handleApproveStart(
      post(`/api/approve/${tipId}/start`, c, { approvalId: approvalId ?? (await signedId(tipId, chain, c)) }),
      tipId,
      { chain },
    );
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
    const call = chain.calls.release[0];
    expect(call.tipId).toBe(seeded.tipId);

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
    expect(call).toEqual({
      tipId: seeded.tipId,
      approvalRef: approvals[0].approvalRef,
      deadline: approvals[0].releaseDeadline,
      signature: approvals[0].releaseSignature,
      approver: APPROVER.address,
    });
    expect(call.approvalRef).toBe(approvalRefFor(seeded.tipId, approvals[0].id));
  });

  it("prepare returns the typed data for this hold and a pending approval", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const res = await prepare(seeded.tipId, fakeChain());
    expect(res.status).toBe(200);
    const body = await res.json();
    const { hold, approvals } = await rows(seeded.tipId);
    const deadline = String(Math.floor(hold.expiresAt.getTime() / 1000));
    expect(body.approver).toBe(APPROVER.address);
    expect(body.typedData).toMatchObject({
      domain: { name: "EndCreditsEscrow", version: "2", chainId: 84532, verifyingContract: ESCROW },
      primaryType: "Release",
      message: {
        tipId: seeded.tipId,
        payee: PAYEE,
        amount: "150000",
        approvalRef: approvalRefFor(seeded.tipId, body.approvalId),
        deadline,
      },
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      id: body.approvalId,
      method: "session",
      status: "pending",
      approvalRef: body.typedData.message.approvalRef,
      releaseDeadline: BigInt(deadline),
      releaseSignature: null,
    });
  });

  it("prepare is 409 no_approver when the owner has no approver wallet", async () => {
    const bare = await makeOwner(db, s, { approver: null });
    const seeded = await seedHold(db, s, bare);
    const res = await prepare(seeded.tipId, fakeChain(), await signInCookie(bare));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_approver" });
    expect((await rows(seeded.tipId)).approvals).toHaveLength(0);
  });

  it("start without a stored signature is 409 no_signature and releases nothing", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const { approvalId } = await (await prepare(seeded.tipId, chain)).json();
    const res = await start(seeded.tipId, chain, cookie, approvalId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_signature" });
    expect(chain.calls.release).toHaveLength(0);
  });

  it("a signature from another key is 400 bad_signature and is not stored", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const { approvalId, typedData } = await (await prepare(seeded.tipId, chain)).json();
    const other = privateKeyToAccount(`0x${"43".repeat(32)}`);
    const res = await sign(seeded.tipId, chain, { approvalId, signature: await signPrepared(typedData, other) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_signature" });
    expect((await rows(seeded.tipId)).approvals[0].releaseSignature).toBeNull();
    expect((await start(seeded.tipId, chain, cookie, approvalId)).status).toBe(409);
    expect(chain.calls.release).toHaveLength(0);
  });

  it("a signature over typed data the client changed (amount) is 400 bad_signature", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const { approvalId, typedData } = await (await prepare(seeded.tipId, chain)).json();
    const forged = { ...typedData, message: { ...typedData.message, amount: "1" } };
    const res = await sign(seeded.tipId, chain, { approvalId, signature: await signPrepared(forged) });
    expect(res.status).toBe(400);
  });

  it("signature and start take only this owner's approval for this tip", async () => {
    const a = await seedHold(db, s, ownerId);
    const b = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const { approvalId, typedData } = await (await prepare(a.tipId, chain)).json();
    expect((await sign(b.tipId, chain, { approvalId, signature: await signPrepared(typedData) })).status).toBe(404);
    expect((await sign(a.tipId, chain, { approvalId: "nope", signature: "0x12" })).status).toBe(400);
    expect((await start(b.tipId, chain, cookie, approvalId)).status).toBe(404);
    expect((await start(a.tipId, chain, cookie, randomUUID())).status).toBe(404);
    expect(chain.calls.release).toHaveLength(0);
  });

  it("a second approve is 409 and releases nothing", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const id = await signedId(seeded.tipId, chain);
    expect((await start(seeded.tipId, chain, cookie, id)).status).toBe(200);
    expect((await start(seeded.tipId, chain, cookie, id)).status).toBe(409);
    expect((await start(seeded.tipId, chain)).status).toBe(409);
    expect(chain.calls.release).toHaveLength(1);
  });

  it("concurrent approves release once", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const ids = [await signedId(seeded.tipId, chain), await signedId(seeded.tipId, chain), await signedId(seeded.tipId, chain)];
    chain.delayMs = 100;
    const results = await Promise.all(ids.map((id) => start(seeded.tipId, chain, cookie, id)));
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

  it("WORLD_REQUIRED=true: start only returns a World URL and releases nothing", async () => {
    process.env.WORLD_REQUIRED = "true";
    worldEnv();
    const [o] = await db.select().from(s.owners).where(eq(s.owners.id, ownerId));
    if (!o.subHash) {
      await db
        .update(s.owners)
        .set({ iss: ISSUER, sub: `approve-test-${ownerId}`, subHash: `0x${"11".repeat(32)}` })
        .where(eq(s.owners.id, ownerId));
    }
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const res = await start(seeded.tipId, chain);
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(new RegExp(`^${ISSUER}/api/v1/authorize\\?`));
    expect(chain.calls.release).toHaveLength(0);
    const { hold, credit, approvals } = await rows(seeded.tipId);
    expect(hold.status).toBe("pending");
    expect(credit.outcome).toBe("held");
    expect(approvals.map((a) => [a.method, a.status])).toEqual([["world", "pending"]]);
    expect(approvals[0].nonce).toBeTruthy();
    expect(approvals[0].releaseSignature).toBeTruthy();
  });

  it("401 without an owner session, for approve and deny", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    expect((await start(seeded.tipId, chain, "")).status).toBe(401);
    expect((await prepare(seeded.tipId, chain, "")).status).toBe(401);
    expect((await sign(seeded.tipId, chain, { approvalId: randomUUID(), signature: "0x12" }, "")).status).toBe(401);
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
