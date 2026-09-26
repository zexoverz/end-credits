// POST /api/approve/:tipId/signature: check and store the approver signature for a prepared approval.
import { defaultApproveDeps } from "@/lib/approve/deps";
import { handleApproveSignature } from "@/lib/approve/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  return handleApproveSignature(req, tipId, defaultApproveDeps());
}
