// GET /api/dashboard: five cards, package table, recent escrow events (DESIGN §12, §15).
// MultiBaas unreachable → 503 with the error; never a fallback number.
import { dashboardResponse } from "@/lib/multibaas/dashboard";
import { defaultDashboardDeps } from "@/lib/multibaas/deps";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return dashboardResponse(defaultDashboardDeps);
}
