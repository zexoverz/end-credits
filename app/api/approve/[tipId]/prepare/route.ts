// POST /api/approve/:tipId/prepare: a pending approval and the EIP-712 release the approver signs.
import { defaultApproveDeps } from "@/lib/approve/deps";
import { handleApprovePrepare } from "@/lib/approve/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  return handleApprovePrepare(req, tipId, defaultApproveDeps());
}
