// GET /api/npm/<name>: the /npm/[name] page's data (T10.5). See lib/claim/summary.ts.
import { claimDepsFromEnv } from "@/lib/claim/env";
import { packageSummary } from "@/lib/claim/summary";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ name: string[] }> }): Promise<Response> {
  return packageSummary(req, (await ctx.params).name, claimDepsFromEnv());
}
