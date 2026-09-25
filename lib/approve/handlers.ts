// HTTP handlers behind app/api/approve/*. Route files pass the production chain; tests a fake.
import { currentOwner, withOwner, worldRequired } from "../auth/owner";
import type { WorldDeps } from "../world/config";
import { approveWithWorld, startWorldApproval } from "../world/stepup";
import { approveWithSession, denyHold, type ActionError, type ApproveChain } from "./actions";
import { isTipId } from "./hold";
import { approveView } from "./view";

export interface ApproveDeps {
  chain: ApproveChain;
  /** Test seams for the World step-up; production passes none. */
  world?: WorldDeps;
}

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });
const noStore = { "cache-control": "no-store" };

function errorResponse(r: ActionError | { error: string; status: number }): Response {
  const { status, ...body } = r;
  return Response.json(body, { status });
}

export async function handleApproveView(req: Request, tipId: string): Promise<Response> {
  if (!isTipId(tipId)) return notFound();
  const view = await approveView(tipId, await currentOwner(req), { worldRequired: worldRequired() });
  return view ? Response.json(view, { headers: noStore }) : notFound();
}

export function handleApproveStart(req: Request, tipId: string, deps: ApproveDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    if (!isTipId(tipId)) return notFound();
    // With World required (or APPROVE_METHOD=world), approval is the World step-up only (E11):
    // the session never releases, it only starts a verification.
    if (approveWithWorld()) {
      const w = await startWorldApproval(ownerId, tipId, deps.world);
      if (!("ok" in w)) return errorResponse(w);
      return Response.json({ status: "verify", url: w.url }, { headers: noStore });
    }
    const r = await approveWithSession(ownerId, tipId, deps.chain);
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
