// Approval step-up, start (DESIGN §14.2). Instead of releasing on the owner session, bind the
// prepared, signed approval row to a World verification by its nonce and send the owner to World for
// a fresh Orb proof: max_age=0, prompt=login, acr_values=orb-v3, PKCE. Nothing is released here; the
// callback releases with the stored approver signature.
import { eq } from "drizzle-orm";
import * as client from "openid-client";
import type { Hex } from "viem";
import { Abort, checked, type ActionError, type SignedApproval } from "../approve/actions";
import { findHold } from "../approve/hold";
import { db } from "../db/client";
import { approvals } from "../db/schema";
import { ACR_ORB, approveRedirectUri, worldConfig, type WorldDeps } from "./config";
import { approvalNonce, APPROVE_TEXT_VERSION, type ApprovalPayload } from "./nonce";
import { authorizeUrl } from "./oidc";
import { ownerWorldId } from "./owner";
import { sealSecret } from "./session";

/** How long a started approval may take in World App before it has to start again. */
export const APPROVAL_TTL_SECONDS = 600;

export type StartResult =
  | { ok: true; url: string; approvalId: string }
  | ActionError
  | { error: "world_not_bound"; status: 409 };

export const approveWithWorld = () =>
  process.env.WORLD_REQUIRED === "true" || process.env.APPROVE_METHOD === "world";

export async function startWorldApproval(
  ownerId: string,
  tipId: Hex,
  approval: SignedApproval,
  deps: WorldDeps = {},
  now: Date = new Date(),
): Promise<StartResult> {
  const identity = await ownerWorldId(ownerId);
  if (!identity?.subHash) return { error: "world_not_bound", status: 409 };
  let row;
  try {
    row = checked(await findHold(db(), tipId), ownerId, now);
  } catch (e) {
    if (e instanceof Abort) return e.result;
    throw e;
  }

  const payload: ApprovalPayload = {
    tipId: row.tipId,
    packageKey: row.packageKey,
    payee: row.payee ?? "",
    amount: row.amountMicro.toString(),
    action: "release",
    text_version: APPROVE_TEXT_VERSION,
    owner_sub_hash: identity.subHash,
    attempt: approval.id,
    approval_ref: approval.approvalRef,
  };
  const nonce = approvalNonce(payload);
  const state = client.randomState();
  const codeVerifier = client.randomPKCECodeVerifier();

  // The World verification clock starts now, not at prepare.
  await db()
    .update(approvals)
    .set({
      method: "world",
      payload,
      nonce,
      state,
      codeVerifierEnc: sealSecret(codeVerifier),
      startedAt: now,
    })
    .where(eq(approvals.id, approval.id));

  const url = await authorizeUrl(worldConfig(deps), {
    redirectUri: approveRedirectUri(),
    state,
    nonce,
    codeVerifier,
    extra: { max_age: "0", prompt: "login", acr_values: ACR_ORB },
  });
  return { ok: true, url: url.href, approvalId: approval.id };
}
