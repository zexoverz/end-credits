// GET /api/risk/<address>: counterparty risk profile from our DB (lib/risk/profile.ts). Public.
import { normalizeAddress, riskProfile } from "@/lib/risk/profile";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }): Promise<Response> {
  const address = normalizeAddress((await ctx.params).address);
  if (!address) return Response.json({ error: "invalid_address" }, { status: 400 });
  return Response.json(await riskProfile(address), { headers: { "cache-control": "no-store" } });
}
