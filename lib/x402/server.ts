// x402 resource for one credit (DESIGN §10, SPEC §8.1, AGENTS rules 6 and 8).
// Quotes only a credit whose stored decision is paid/capped and whose payee was screened in the
// last 10 minutes; verifies and settles through the facilitator; returns a signed receipt.
import { getAddress, isAddress, type LocalAccount } from "viem";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { CRITICAL, REFUSE_ABOVE } from "../decision/matrix";
import type { ScreenError } from "../decision/types";
import { msg } from "../messages";
import {
  MAX_TIMEOUT_SECONDS,
  NETWORK,
  PAYABLE_OUTCOMES,
  SCHEME,
  SCREEN_MAX_AGE_MS,
  USDC_EXTRA,
  X402_VERSION,
} from "./constants";
import { signReceipt, type Receipt } from "./receipt";

export type PayableCredit = {
  id: string;
  packageName: string;
  sessionId: string;
  amountMicro: bigint;
  payee: string | null;
  outcome: string | null;
  txHash: string | null;
  receipt: Receipt | null;
};

export interface CreditRepo {
  loadCredit(id: string): Promise<PayableCredit | null>;
  /** Time of the newest successful `address` screen of this address, any case. */
  latestAddressScreenAt(address: string): Promise<Date | null>;
  saveSettlement(id: string, tx: string, receipt: Receipt): Promise<void>;
  /** Appends a `screens` row id to the credit's screen_ids (the payer screen), once. */
  addScreenId(id: string, screenId: string): Promise<void>;
}

/** Intercepta quick scan of the paying wallet (lib/intercepta/client.ts quickScan). */
export type PayerScreen =
  | { ok: true; data: { toxicScore: number; traits: { name: string; description: string }[]; noHistory?: true }; screenId: string }
  | { ok: false; error: ScreenError; screenId?: string };

export type ServerDeps = {
  repo: CreditRepo;
  facilitator: Pick<FacilitatorClient, "verify" | "settle">;
  usdc: string;
  receiptSigner: LocalAccount;
  screenPayer(address: string): Promise<PayerScreen>;
  now?: () => Date;
};

export type CreditRequest = { creditId: string; resourceUrl: string; paymentHeader: string | null };

type Quotable = PayableCredit & { payee: string };

export function buildPaymentRequired(c: Quotable, usdc: string, url: string): PaymentRequired {
  return {
    x402Version: X402_VERSION,
    resource: { url, description: `End Credits: ${c.packageName}, session ${c.sessionId.slice(0, 8)}` },
    accepts: [
      {
        scheme: SCHEME,
        network: NETWORK,
        asset: getAddress(usdc),
        amount: c.amountMicro.toString(),
        payTo: getAddress(c.payee),
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        extra: { ...USDC_EXTRA },
      },
    ],
  };
}

async function quotable(c: PayableCredit, deps: ServerDeps): Promise<Quotable | null> {
  if (!c.outcome || !PAYABLE_OUTCOMES.includes(c.outcome)) return null;
  const payee = c.payee;
  if (!payee || !isAddress(payee, { strict: false })) return null;
  const screenedAt = await deps.repo.latestAddressScreenAt(payee);
  const now = (deps.now ?? (() => new Date()))().getTime();
  if (screenedAt === null || now - screenedAt.getTime() > SCREEN_MAX_AGE_MS) return null;
  return { ...c, payee };
}

const sameAddress = (a: unknown, b: string) =>
  typeof a === "string" && isAddress(a, { strict: false }) && a.toLowerCase() === b.toLowerCase();

// The client's copy of the requirements and its signed authorization must match this credit.
function matchesCredit(payment: PaymentPayload, required: PaymentRequirements): boolean {
  const a = payment.accepted;
  const auth = payment.payload?.authorization as { to?: unknown; value?: unknown } | undefined;
  return (
    payment.x402Version === X402_VERSION &&
    a?.scheme === required.scheme &&
    a.network === required.network &&
    sameAddress(a.asset, required.asset) &&
    sameAddress(a.payTo, required.payTo) &&
    a.amount === required.amount &&
    (auth === undefined || (sameAddress(auth.to, required.payTo) && String(auth.value) === required.amount))
  );
}

function paymentRequired(challenge: PaymentRequired, error?: string): Response {
  const body = error ? { ...challenge, error } : challenge;
  return Response.json(body, {
    status: 402,
    headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body), "Cache-Control": "no-store" },
  });
}

function decode(header: string): PaymentPayload | null {
  try {
    return decodePaymentSignatureHeader(header);
  } catch {
    return null;
  }
}

// The paid side screens who pays (decisions.md, screen the payer): a flagged wallet gets 403, a
// failed screen 503, and neither reaches the facilitator. A wallet with no mainnet history passes.
async function screenPayer(creditId: string, payment: PaymentPayload, deps: ServerDeps): Promise<Response | null> {
  const from = (payment.payload?.authorization as { from?: unknown } | undefined)?.from;
  if (typeof from !== "string" || !isAddress(from, { strict: false })) {
    return Response.json({ code: "INVALID_PAYMENT" }, { status: 400 });
  }
  const screen: PayerScreen = await deps.screenPayer(from).catch(() => ({ ok: false as const, error: "HTTP" as const }));
  if (screen.screenId) await deps.repo.addScreenId(creditId, screen.screenId);
  if (!screen.ok) {
    const message = msg("PAYER_SCREEN_UNAVAILABLE", { error: screen.error });
    return Response.json({ code: "PAYER_SCREEN_UNAVAILABLE", message }, { status: 503 });
  }
  const { toxicScore, traits } = screen.data;
  const critical = traits.filter((t) => CRITICAL.has(t.name));
  if (critical.length === 0 && toxicScore <= REFUSE_ABOVE) return null;
  const named = critical.length > 0 ? critical : traits;
  const description = named.length > 0 ? named.map((t) => t.description).join(" ") : `Toxic score ${toxicScore}.`;
  return Response.json({ code: "PAYER_REFUSED", message: msg("PAYER_REFUSED", { description }) }, { status: 403 });
}

export async function handleCreditRequest(req: CreditRequest, deps: ServerDeps): Promise<Response> {
  const loaded = await deps.repo.loadCredit(req.creditId);
  if (!loaded) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (loaded.txHash && loaded.receipt) return Response.json(loaded.receipt);
  const c = await quotable(loaded, deps);
  if (!c) return Response.json({ code: "NOT_PAYABLE", message: msg("NOT_PAYABLE") }, { status: 409 });

  const challenge = buildPaymentRequired(c, deps.usdc, req.resourceUrl);
  if (!req.paymentHeader) return paymentRequired(challenge);

  const payment = decode(req.paymentHeader);
  if (!payment) return paymentRequired(challenge, "INVALID_PAYMENT");
  const required = challenge.accepts[0];
  if (!matchesCredit(payment, required)) return paymentRequired(challenge, "CHALLENGE_MISMATCH");

  const refusal = await screenPayer(c.id, payment, deps);
  if (refusal) return refusal;

  const verified = await deps.facilitator.verify(payment, required);
  if (!verified.isValid) return paymentRequired(challenge, verified.invalidReason ?? "INVALID_PAYMENT");
  const settled = await deps.facilitator.settle(payment, required);
  if (!settled.success) return paymentRequired(challenge, settled.errorReason ?? "SETTLE_FAILED");

  const receipt = await signReceipt(
    { creditId: c.id, package: c.packageName, amount: required.amount, payee: required.payTo, tx: settled.transaction },
    deps.receiptSigner,
  );
  await deps.repo.saveSettlement(c.id, settled.transaction, receipt);
  return Response.json(receipt, { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled) } });
}
