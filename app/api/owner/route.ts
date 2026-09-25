// GET /api/owner: payer and balance, settings, pending holds, unread notifications (owner only).
import { handleSummary } from "@/lib/owner/handlers";
import { defaultSummaryDeps } from "@/lib/owner/deps";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleSummary(req, defaultSummaryDeps());
