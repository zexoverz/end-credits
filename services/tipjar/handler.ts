// A maintainer's own x402 tip jar (decisions.md "Agent-to-agent x402"). Not End Credits: a separate
// service a maintainer could run, named in their FUNDING.json as `x402.endpoint`. Two jars:
//   /honest/tip  asks to be paid to HONEST_PAYTO, the address its FUNDING.json lists.
//   /clipper/tip asks to be paid to CLIPPER_PAYTO, a different address than its FUNDING.json lists.
// Both verify and settle through the facilitator exactly the same way; the clipper is never paid
// because the paying agent refuses its challenge before signing.
import { getAddress, isAddress } from "viem";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { MAX_TIMEOUT_SECONDS, NETWORK, SCHEME, USDC_EXTRA, X402_VERSION } from "../../lib/x402/constants";

/** One tip is at most 1 USDC. */
export const MAX_TIP_MICRO = BigInt(1_000_000);

export type TipjarConfig = {
  honestPayTo: string;
  clipperPayTo: string;
  usdc: string;
  facilitator: Pick<FacilitatorClient, "verify" | "settle">;
  log?: (line: string) => void;
};

const JARS = { "/honest/tip": "honestPayTo", "/clipper/tip": "clipperPayTo" } as const;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function tipAmount(raw: string | null): bigint | null {
  if (!raw || !/^\d{1,7}$/.test(raw)) return null;
  const amount = BigInt(raw);
  return amount > BigInt(0) && amount <= MAX_TIP_MICRO ? amount : null;
}

export function tipChallenge(url: URL, payTo: string, usdc: string, amount: bigint): PaymentRequired {
  const ref = url.searchParams.get("ref");
  return {
    x402Version: X402_VERSION,
    resource: { url: url.toString(), description: `Tip jar${ref ? `, ref ${ref.slice(0, 64)}` : ""}` },
    accepts: [
      {
        scheme: SCHEME,
        network: NETWORK,
        asset: getAddress(usdc),
        amount: amount.toString(),
        payTo: getAddress(payTo),
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        extra: { ...USDC_EXTRA },
      },
    ],
  };
}

const same = (a: unknown, b: string) => typeof a === "string" && isAddress(a, { strict: false }) && a.toLowerCase() === b.toLowerCase();

// The signed payment must be for this jar's own requirements; the facilitator gets ours, not the client's.
function matches(payment: PaymentPayload, required: PaymentRequirements): boolean {
  const a = payment.accepted;
  const auth = payment.payload?.authorization as { to?: unknown; value?: unknown } | undefined;
  return (
    payment.x402Version === X402_VERSION &&
    a?.scheme === required.scheme &&
    a.network === required.network &&
    same(a.asset, required.asset) &&
    same(a.payTo, required.payTo) &&
    a.amount === required.amount &&
    same(auth?.to, required.payTo) &&
    String(auth?.value) === required.amount
  );
}

function paymentRequired(challenge: PaymentRequired, error?: string): Response {
  const body = error ? { ...challenge, error } : challenge;
  return json(body, 402, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body) });
}

export async function handleTip(req: Request, cfg: TipjarConfig): Promise<Response> {
  const url = new URL(req.url);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (url.pathname === "/health") return json({ ok: true });
  const jar = JARS[url.pathname as keyof typeof JARS];
  if (!jar) return json({ error: "not_found" }, 404);
  const amount = tipAmount(url.searchParams.get("amount"));
  if (amount === null) return json({ error: "amount must be micro-USDC, 1 to 1000000" }, 400);

  const challenge = tipChallenge(url, cfg[jar], cfg.usdc, amount);
  const header = req.headers.get("PAYMENT-SIGNATURE");
  if (!header) return paymentRequired(challenge);

  let payment: PaymentPayload;
  try {
    payment = decodePaymentSignatureHeader(header);
  } catch {
    return paymentRequired(challenge, "INVALID_PAYMENT");
  }
  const required = challenge.accepts[0];
  if (!matches(payment, required)) return paymentRequired(challenge, "CHALLENGE_MISMATCH");

  const verified = await cfg.facilitator.verify(payment, required);
  if (!verified.isValid) return paymentRequired(challenge, verified.invalidReason ?? "INVALID_PAYMENT");
  const settled = await cfg.facilitator.settle(payment, required);
  if (!settled.success) return paymentRequired(challenge, settled.errorReason ?? "SETTLE_FAILED");

  cfg.log?.(`tipjar ${url.pathname}: ${required.amount} to ${required.payTo}, tx ${settled.transaction}`);
  return json(
    { ok: true, jar: url.pathname, amount: required.amount, payTo: required.payTo, tx: settled.transaction },
    200,
    { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled) },
  );
}
