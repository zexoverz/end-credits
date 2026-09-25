// Approval step-up, callback (DESIGN §14.2): GET /api/approve/callback?code&state (or ?error=…).
// Checks in order: pending approval by state (else 400 UNKNOWN_STATE), cancelled, exchange +
// verifyIdToken with the stored nonce, (iss, sub) is the owner, auth_time >= started_at. Only then
// the recorder releases, through the same outcome as the session path but with APPROVED. Every
// failure marks the approval failed with its code, releases nothing, and 302s to the approve page.
import { and, eq } from "drizzle-orm";
import { keccak256, stringToBytes, type Hex } from "viem";
import {
  Abort,
  chainCode,
  checked,
  markReleased,
  unwrap,
  type ApproveChain,
} from "../approve/actions";
import { lockHold } from "../approve/hold";
import { db } from "../db/client";
import { approvals, holds } from "../db/schema";
import { msg } from "../messages";
import { appPath, approveRedirectUri, publicCallbackUrl, worldConfig, type WorldDeps } from "./config";
import { exchangeCode } from "./exchange";
import { redirect } from "./oidc";
import { ownerWorldId } from "./owner";
import { unsealSecret } from "./session";
import { APPROVAL_TTL_SECONDS } from "./stepup";
import { WorldTokenError, type VerifiedIdToken } from "./verify";

export interface ApproveCallbackDeps {
  chain: ApproveChain;
  world?: WorldDeps;
}

interface Pending {
  id: string;
  ownerId: string;
  nonce: string;
  state: string;
  codeVerifierEnc: string | null;
  startedAt: Date;
  tipId: Hex;
}

async function pendingByState(state: string): Promise<Pending | null> {
  const [row] = await db()
    .select({
      id: approvals.id,
      ownerId: approvals.ownerId,
      nonce: approvals.nonce,
      state: approvals.state,
      codeVerifierEnc: approvals.codeVerifierEnc,
      startedAt: approvals.startedAt,
      tipId: holds.tipId,
    })
    .from(approvals)
    .innerJoin(holds, eq(holds.id, approvals.holdId))
    .where(and(eq(approvals.state, state), eq(approvals.method, "world"), eq(approvals.status, "pending")))
    .limit(1);
  if (!row?.nonce || !row.state) return null;
  return { ...row, nonce: row.nonce, state: row.state, tipId: row.tipId as Hex };
}

const unknownState = () =>
  Response.json({ error: "UNKNOWN_STATE", message: msg("UNKNOWN_STATE") }, { status: 400 });

const toPage = (tipId: string, result: string) =>
  redirect(appPath(`/approve/${tipId}?result=${encodeURIComponent(result)}`));

async function markFailed(id: string, code: string, identity?: VerifiedIdToken): Promise<void> {
  await db()
    .update(approvals)
    .set({
      status: "failed",
      failureCode: code,
      completedAt: new Date(),
      authTime: identity?.authTime != null ? new Date(identity.authTime * 1000) : null,
      acr: identity?.acr ?? null,
      amr: identity?.amr ?? null,
    })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")));
}

/** What is left to check once World has answered; null when the release may go ahead. */
async function identityProblem(a: Pending, identity: VerifiedIdToken): Promise<string | null> {
  const owner = await ownerWorldId(a.ownerId);
  if (!owner || owner.iss !== identity.iss || owner.sub !== identity.sub) return "WRONG_HUMAN";
  const startedSec = Math.floor(a.startedAt.getTime() / 1000);
  if (identity.authTime === null || identity.authTime < startedSec) return "STALE_AUTH";
  return null;
}

async function release(
  a: Pending,
  identity: VerifiedIdToken,
  chain: ApproveChain,
  now: Date,
): Promise<{ ok: true } | { code: string }> {
  const result = await unwrap(() =>
    db().transaction(async (tx) => {
      // The hold lock is the one-release guard, as on the session path: a second callback racing
      // this one waits, then finds the hold released (not_pending) and releases nothing.
      const row = checked(await lockHold(tx, a.tipId), a.ownerId, now);
      let releaseTx: Hex;
      try {
        releaseTx = await chain.release(a.tipId, keccak256(stringToBytes(a.nonce)));
      } catch (e) {
        throw new Abort({ error: "chain_error", status: 502, code: chainCode(e) });
      }
      const done = new Date();
      await markReleased(tx, row, releaseTx, "APPROVED", done);
      await tx
        .update(approvals)
        .set({
          status: "approved",
          completedAt: done,
          authTime: identity.authTime != null ? new Date(identity.authTime * 1000) : null,
          acr: identity.acr,
          amr: identity.amr,
        })
        .where(eq(approvals.id, a.id));
      return { ok: true as const };
    }),
  );
  if ("ok" in result) return result;
  return { code: result.error === "chain_error" ? result.code : result.error };
}

export async function handleApproveCallback(
  req: Request,
  deps: ApproveCallbackDeps,
  now: Date = new Date(),
): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  const a = state ? await pendingByState(state) : null;
  if (!a) return unknownState();

  const fail = async (code: string, identity?: VerifiedIdToken) => {
    await markFailed(a.id, code, identity);
    return toPage(a.tipId, code);
  };

  if (params.get("error")) return fail("CANCELLED");
  // A started approval lives 10 minutes; after that it has to start again.
  const tooOld = now.getTime() - a.startedAt.getTime() > APPROVAL_TTL_SECONDS * 1000;
  const codeVerifier = a.codeVerifierEnc && !tooOld ? unsealSecret(a.codeVerifierEnc) : null;
  if (!codeVerifier) return fail("STALE_AUTH");

  let identity: VerifiedIdToken;
  try {
    identity = await exchangeCode(
      worldConfig(deps.world),
      publicCallbackUrl(req, approveRedirectUri()),
      { state: a.state, nonce: a.nonce, codeVerifier },
      deps.world ?? {},
    );
  } catch (err) {
    if (err instanceof WorldTokenError) return fail(err.code);
    throw err;
  }

  const problem = await identityProblem(a, identity);
  if (problem) return fail(problem, identity);

  const released = await release(a, identity, deps.chain, now);
  if ("code" in released) return fail(released.code, identity);
  return toPage(a.tipId, "APPROVED");
}
