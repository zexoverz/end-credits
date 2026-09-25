// POST /api/approve/:tipId/deny: the owner refunds a held tip.
import { defaultApproveDeps } from "@/lib/approve/deps";
import { handleDeny } from "@/lib/approve/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  return handleDeny(req, tipId, defaultApproveDeps());
}
