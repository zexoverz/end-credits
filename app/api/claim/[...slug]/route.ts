// /api/claim/<name>/{wallet,pr,status} (T10.2-T10.4). The action is the last path segment because a
// Next.js catch-all must end the route; see lib/claim/http.ts.
import { claimDepsFromEnv } from "@/lib/claim/env";
import { handleClaim } from "@/lib/claim/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  return handleClaim(req, (await ctx.params).slug, claimDepsFromEnv());
}

export const GET = handle;
export const POST = handle;
