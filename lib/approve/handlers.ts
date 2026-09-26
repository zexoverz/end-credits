// HTTP handlers behind app/api/approve/*. Route files pass the production chain; tests a fake.
// Escrow v2 order: prepare → the approver wallet signs → signature → start (→ World) → release.
import { z } from "zod";
import { currentOwner, withOwner, worldRequired } from "../auth/owner";
import type { WorldDeps } from "../world/config";
import { approveWithWorld, startWorldApproval } from "../world/stepup";
import { approveWithSession, denyHold, type ActionError, type ApproveChain } from "./actions";
import { isTipId } from "./hold";
import { holdProblem, prepareApproval, signedApproval, storeSignature } from "./signed";
import { approveView } from "./view";

export interface ApproveDeps {
  chain: ApproveChain;
  /** Test seams for the World step-up; production passes none. */
  world?: WorldDeps;
}

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });
const invalid = () => Response.json({ error: "invalid_body" }, { status: 400 });
const noStore = { "cache-control": "no-store" };

function errorResponse(r: ActionError | { error: string; status: number }): Response {
  const { status, ...body } = r;
  return Response.json(body, { status });
}

const approvalBody = z.object({ approvalId: z.uuid() });
const signatureBody = approvalBody.extend({ signature: z.string().regex(/^0x([0-9a-fA-F]{2})+$/) });

async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await req.json().catch(() => undefined));
  return parsed.success ? parsed.data : null;
}

export async function handleApproveView(req: Request, tipId: string): Promise<Response> {
  if (!isTipId(tipId)) return notFound();
  const view = await approveView(tipId, await currentOwner(req), { worldRequired: worldRequired() });
  return view ? Response.json(view, { headers: noStore }) : notFound();
}

/** POST /api/approve/:tipId/prepare → { approvalId, typedData, approver }. */
export function handleApprovePrepare(req: Request, tipId: string, deps: ApproveDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    if (!isTipId(tipId)) return notFound();
    const r = await prepareApproval(ownerId, tipId, deps.chain);
    if (!("ok" in r)) return errorResponse(r);
    const { approvalId, typedData, approver } = r;
    return Response.json({ approvalId, typedData, approver }, { headers: noStore });
  });
}

/** POST /api/approve/:tipId/signature { approvalId, signature } → { status: "signed" }. */
export function handleApproveSignature(req: Request, tipId: string, deps: ApproveDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    if (!isTipId(tipId)) return notFound();
    const b = await body(req, signatureBody);
    if (!b) return invalid();
    const r = await storeSignature(ownerId, tipId, b.approvalId, b.signature as `0x${string}`, deps.chain);
    if (!("ok" in r)) return errorResponse(r);
    return Response.json({ status: "signed" }, { headers: noStore });
  });
}

/** POST /api/approve/:tipId/start { approvalId }: releases now, or starts World when required. */
export function handleApproveStart(req: Request, tipId: string, deps: ApproveDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    if (!isTipId(tipId)) return notFound();
    const problem = await holdProblem(ownerId, tipId);
    if (problem) return errorResponse(problem);
    const b = await body(req, approvalBody);
    if (!b) return invalid();
    const approval = await signedApproval(ownerId, tipId, b.approvalId);
    if ("error" in approval) return errorResponse(approval);
    // With World required (or APPROVE_METHOD=world), approval is the World step-up only (E11):
    // the session never releases, it only starts a verification.
    if (approveWithWorld()) {
      const w = await startWorldApproval(ownerId, tipId, approval, deps.world);
      if (!("ok" in w)) return errorResponse(w);
      return Response.json({ status: "verify", url: w.url }, { headers: noStore });
    }
    const r = await approveWithSession(ownerId, tipId, approval, deps.chain);
    if (!("ok" in r)) return errorResponse(r);
    return Response.json({ status: "approved", releaseTx: r.releaseTx, message: r.message });
  });
}

export function handleDeny(req: Request, tipId: string, deps: ApproveDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    if (!isTipId(tipId)) return notFound();
    const r = await denyHold(ownerId, tipId, deps.chain);
    if (!("ok" in r)) return errorResponse(r);
    return Response.json({ status: "denied", refundTx: r.refundTx, message: r.message });
  });
}
