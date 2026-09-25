// POST /api/webhooks/multibaas: MultiBaas `event.emitted` deliveries (DESIGN §15).
// The HMAC is checked over the exact body bytes, so the body is read once as bytes.
import { defaultWebhookDeps } from "@/lib/multibaas/deps";
import { handleMultiBaasWebhook, type WebhookDeps } from "@/lib/multibaas/webhook";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 5_000_000;

export async function POST(req: Request): Promise<Response> {
  let deps: WebhookDeps;
  try {
    deps = defaultWebhookDeps();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  return handleMultiBaasWebhook(
    {
      raw,
      signature: req.headers.get("x-multibaas-signature"),
      timestamp: req.headers.get("x-multibaas-timestamp"),
    },
    deps,
  );
}
