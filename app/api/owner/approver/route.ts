// GET/POST /api/owner/approver: the approver wallet that signs releases (escrow v2), stored and on chain.
import { ownerApproverChain } from "@/lib/owner/deps";
import { handleGetApprover, handleSetApprover } from "@/lib/owner/handlers";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleGetApprover(req, ownerApproverChain);
export const POST = (req: Request) => handleSetApprover(req, ownerApproverChain);
