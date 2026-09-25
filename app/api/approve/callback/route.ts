// GET /api/approve/callback: World's redirect after the approval step-up (DESIGN §14.2).
import { defaultApproveDeps } from "@/lib/approve/deps";
import { handleApproveCallback } from "@/lib/world/approve-callback";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleApproveCallback(req, defaultApproveDeps());
