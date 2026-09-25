// Approval step-up (T11.3) and its denied paths (T11.4): real Postgres, fake chain, World's token
// endpoint faked by an injected fetch, ID tokens signed by a local key. Skipped without
// TEST_DATABASE_URL. Every denied path asserts its code and that release was never called.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { keccak256, stringToBytes, type Hex } from "viem";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  APP,
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
import { msg } from "../messages";
import { ACR_ORB } from "./config";
import { fakeTokenEndpoint, goodClaims, ISSUER, startIdp, worldEnv, type Idp } from "./__fixtures__/idp";

type Conn = Awaited<ReturnType<typeof connect>>;

describe.skipIf(!TEST_DB)("world approval step-up (integration)", () => {
  let idp: Idp;
  let db: Conn["db"];
  let s: Conn["s"];
  let h: typeof import("../approve/handlers");
  let cb: typeof import("./approve-callback");
  let ownerId: string;
  let ownerSub: string;
  let cookie: string;

  beforeAll(async () => {
    ({ db, s } = await connect());
    worldEnv();
    idp = await startIdp();
    h = await import("../approve/handlers");
    cb = await import("./approve-callback");
    const { subHash } = await import("./owner");
    ownerId = await makeOwner(db, s);
    ownerSub = `human-${randomUUID()}`;
    await db
      .update(s.owners)
      .set({ iss: ISSUER, sub: ownerSub, subHash: subHash(ISSUER, ownerSub) })
      .where(eq(s.owners.id, ownerId));
    cookie = await signInCookie(ownerId);
  });
  afterAll(() => idp.close());
  afterEach(() => {
    delete process.env.WORLD_REQUIRED;
    delete process.env.APPROVE_METHOD;
  });

  const rows = async (tipId: Hex) => {
    const [hold] = await db.select().from(s.holds).where(eq(s.holds.tipId, tipId));
    const [credit] = await db.select().from(s.credits).where(eq(s.credits.id, hold.creditId));
    const approvals = await db.select().from(s.approvals).where(eq(s.approvals.holdId, hold.id));
    return { hold, credit, approvals };
  };

  /** POST start with WORLD_REQUIRED=true; returns the authorize URL's params. */
  async function startApproval(tipId: Hex) {
    process.env.WORLD_REQUIRED = "true";
    const chain = fakeChain();
    const res = await h.handleApproveStart(
      req(`/api/approve/${tipId}/start`, { method: "POST", cookie }),
      tipId,
      { chain },
    );
    expect(res.status).toBe(200);
    const url = new URL((await res.json()).url);
    expect(chain.calls.release).toHaveLength(0);
    return url;
  }

  /** World's redirect back with a token for `claims` (on top of a good one for this nonce). */
  async function callback(url: URL, claims: Record<string, unknown> = {}, query?: string) {
    const nonce = url.searchParams.get("nonce")!;
    const state = url.searchParams.get("state")!;
    const token = fakeTokenEndpoint(async () => ({
      json: {
        access_token: "at",
        token_type: "Bearer",
        id_token: await idp.sign(goodClaims({ nonce, sub: ownerSub, ...claims })),
      },
    }));
    const chain = fakeChain();
    const res = await cb.handleApproveCallback(
      req(`/api/approve/callback?${query ?? `code=c-${randomUUID()}&state=${state}`}`),
      { chain, world: { fetch: token.fetch, jwks: idp.jwks } },
    );
    return { res, chain, calls: token.calls };
  }

  it("start: authorize URL with the step-up params, and a pending world approval bound by nonce", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const url = await startApproval(seeded.tipId);
    const p = url.searchParams;
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/api/v1/authorize`);
    expect(p.get("scope")).toBe("openid");
    expect(p.get("max_age")).toBe("0");
    expect(p.get("prompt")).toBe("login");
    expect(p.get("acr_values")).toBe(ACR_ORB);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("redirect_uri")).toBe(`${APP}/api/approve/callback`);

    const { approvals } = await rows(seeded.tipId);
    expect(approvals).toHaveLength(1);
    const a = approvals[0];
    expect(a).toMatchObject({ method: "world", status: "pending", ownerId, state: p.get("state") });
    expect(a.nonce).toBe(p.get("nonce"));
    expect(a.codeVerifierEnc).toBeTruthy();
    const { approvalNonce } = await import("./nonce");
    expect(approvalNonce(a.payload as never)).toBe(a.nonce);
    expect(a.payload).toMatchObject({
      tipId: seeded.tipId,
      payee: PAYEE,
      amount: "150000",
      action: "release",
      text_version: "v1",
      attempt: a.id,
    });
  });

  it("start: APPROVE_METHOD=world also starts the step-up instead of releasing", async () => {
    process.env.APPROVE_METHOD = "world";
    const seeded = await seedHold(db, s, ownerId);
    const chain = fakeChain();
    const res = await h.handleApproveStart(
      req(`/api/approve/${seeded.tipId}/start`, { method: "POST", cookie }),
      seeded.tipId,
      { chain },
    );
    expect((await res.json()).status).toBe("verify");
    expect(chain.calls.release).toHaveLength(0);
  });

  it("start: an owner not bound to a World ID gets 409", async () => {
    process.env.WORLD_REQUIRED = "true";
    const other = await makeOwner(db, s);
    const seeded = await seedHold(db, s, other);
    const res = await h.handleApproveStart(
      req(`/api/approve/${seeded.tipId}/start`, { method: "POST", cookie: await signInCookie(other) }),
      seeded.tipId,
      { chain: fakeChain() },
    );
    expect(res.status).toBe(409);
  });

  it("approved: releases with keccak256(nonce), credit paid, APPROVED appended", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const url = await startApproval(seeded.tipId);
    const { res, chain, calls } = await callback(url);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/approve/${seeded.tipId}?result=APPROVED`);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get("redirect_uri")).toBe(`${APP}/api/approve/callback`);
    const nonce = url.searchParams.get("nonce")!;
    expect(chain.calls.release).toEqual([[seeded.tipId, keccak256(stringToBytes(nonce))]]);

    const { hold, credit, approvals } = await rows(seeded.tipId);
    expect(hold.status).toBe("released");
    expect(credit.outcome).toBe("paid");
    expect(credit.txHash).toBe(hold.releaseTx);
    expect(credit.reasons).toEqual([
      { source: "payee", code: "HELD_CHANGED", text: HELD_TEXT },
      { source: "owner", code: "APPROVED", text: msg("APPROVED", { amount: "0.15", address: PAYEE }) },
    ]);
    expect(approvals[0]).toMatchObject({ status: "approved", acr: ACR_ORB, amr: ["pop"] });
    expect(approvals[0].authTime).toBeInstanceOf(Date);

    // The state is single use: replaying the callback is UNKNOWN_STATE and releases nothing more.
    const replay = await callback(url);
    expect(replay.res.status).toBe(400);
    expect((await replay.res.json()).error).toBe("UNKNOWN_STATE");
    expect(replay.chain.calls.release).toHaveLength(0);
  });

  it("two callbacks racing for one approval release once", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const url = await startApproval(seeded.tipId);
    const nonce = url.searchParams.get("nonce")!;
    const state = url.searchParams.get("state")!;
    const token = fakeTokenEndpoint(async () => ({
      json: { access_token: "at", token_type: "Bearer", id_token: await idp.sign(goodClaims({ nonce, sub: ownerSub })) },
    }));
    const chain = fakeChain();
    chain.delayMs = 100;
    const results = await Promise.all(
      [1, 2].map(() =>
        cb.handleApproveCallback(req(`/api/approve/callback?code=c&state=${state}`), {
          chain,
          world: { fetch: token.fetch, jwks: idp.jwks },
        }),
      ),
    );
    expect(chain.calls.release).toHaveLength(1);
    const codes = results.map((r) => new URL(r.headers.get("location")!).searchParams.get("result")).sort();
    expect(codes).toEqual(["APPROVED", "not_pending"]);
    expect((await rows(seeded.tipId)).approvals.map((a) => a.status)).toEqual(["approved"]);
  });

  async function denied(claims: Record<string, unknown>, query?: (state: string) => string) {
    const seeded = await seedHold(db, s, ownerId);
    const url = await startApproval(seeded.tipId);
    const q = query?.(url.searchParams.get("state")!);
    const out = await callback(url, claims, q);
    const after = await rows(seeded.tipId);
    expect(out.chain.calls.release).toHaveLength(0);
    expect(after.hold.status).toBe("pending");
    expect(after.credit.outcome).toBe("held");
    return { ...out, seeded, after, code: new URL(out.res.headers.get("location")!).searchParams.get("result") };
  }

  it("cancelled in World App: CANCELLED, no token call, nothing released", async () => {
    const r = await denied({}, (state) => `error=access_denied&state=${state}`);
    expect(r.code).toBe("CANCELLED");
    expect(r.calls).toHaveLength(0);
    expect(r.after.approvals.map((a) => [a.status, a.failureCode])).toEqual([["failed", "CANCELLED"]]);
  });

  it("stale auth_time (before started_at): STALE_AUTH, nothing released", async () => {
    const r = await denied({ auth_time: Math.floor(Date.now() / 1000) - 120 });
    expect(r.code).toBe("STALE_AUTH");
    expect(r.after.approvals[0]).toMatchObject({ status: "failed", failureCode: "STALE_AUTH" });
  });

  it("an approval started over 10 minutes ago: STALE_AUTH before any token call", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const url = await startApproval(seeded.tipId);
    const [hold] = await db.select().from(s.holds).where(eq(s.holds.tipId, seeded.tipId));
    await db
      .update(s.approvals)
      .set({ startedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(s.approvals.holdId, hold.id));
    const { res, chain, calls } = await callback(url, { auth_time: Math.floor(Date.now() / 1000) });
    expect(new URL(res.headers.get("location")!).searchParams.get("result")).toBe("STALE_AUTH");
    expect(calls).toHaveLength(0);
    expect(chain.calls.release).toHaveLength(0);
  });

  it("missing auth_time: STALE_AUTH, nothing released", async () => {
    const r = await denied({ auth_time: undefined });
    expect(r.code).toBe("STALE_AUTH");
  });

  it("wrong nonce: NONCE, nothing released", async () => {
    const r = await denied({ nonce: "issued-for-something-else" });
    expect(r.code).toBe("NONCE");
    expect(r.after.approvals[0]).toMatchObject({ status: "failed", failureCode: "NONCE" });
  });

  it("another human (other sub): WRONG_HUMAN, nothing released", async () => {
    const r = await denied({ sub: "someone-else" });
    expect(r.code).toBe("WRONG_HUMAN");
    expect(r.after.approvals[0]).toMatchObject({ status: "failed", failureCode: "WRONG_HUMAN" });
  });

  it("missing acr: ACR, nothing released", async () => {
    const r = await denied({ acr: undefined });
    expect(r.code).toBe("ACR");
  });

  it("no pop in amr: AMR, nothing released", async () => {
    const r = await denied({ amr: ["pwd"] });
    expect(r.code).toBe("AMR");
  });

  it("the hold expired while in World App: expired, nothing released", async () => {
    const seeded = await seedHold(db, s, ownerId);
    const url = await startApproval(seeded.tipId);
    await db.update(s.holds).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.holds.tipId, seeded.tipId));
    const { res, chain } = await callback(url);
    expect(new URL(res.headers.get("location")!).searchParams.get("result")).toBe("expired");
    expect(chain.calls.release).toHaveLength(0);
  });

  it("an unknown state is 400 UNKNOWN_STATE", async () => {
    const res = await cb.handleApproveCallback(req(`/api/approve/callback?code=c&state=nope`), {
      chain: fakeChain(),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "UNKNOWN_STATE", message: msg("UNKNOWN_STATE") });
  });
});
