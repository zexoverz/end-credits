import type { NextRequest } from "next/server";
import { readEnv } from "@/lib/env";
import { defaultServerDeps } from "@/lib/x402/deps";
import { handleCreditRequest } from "@/lib/x402/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ creditId: string }> }) {
  const { creditId } = await ctx.params;
  if (!UUID.test(creditId)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  // The challenge names the public URL, not the proxy-internal one the handler sees.
  const resourceUrl = `${readEnv("APP_URL")}/api/x402/credit/${creditId}`;
  return handleCreditRequest(
    { creditId, resourceUrl, paymentHeader: req.headers.get("PAYMENT-SIGNATURE") },
    defaultServerDeps(),
  );
}
