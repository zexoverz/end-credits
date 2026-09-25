// GET /api/approve/:tipId: the held tip as the phone page shows it (DESIGN §12).
import { handleApproveView } from "@/lib/approve/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  return handleApproveView(req, tipId);
}
