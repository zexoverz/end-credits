// POST /api/approve/:tipId/start: owner session approval, releasing the tip (DESIGN §14.2, before
// E11). 403 when WORLD_REQUIRED=true.
import { defaultApproveDeps } from "@/lib/approve/deps";
import { handleApproveStart } from "@/lib/approve/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  return handleApproveStart(req, tipId, defaultApproveDeps());
}
