// Settler-side x402 client (DESIGN §10, AGENTS rules 6 and 8). Nothing is signed unless a paid or
// capped decision is stored for the credit and the 402 challenge matches what was screened.
import { getAddress, isAddress } from "viem";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ENDPOINT_REASONS, msg } from "../messages";
import { MAX_TIMEOUT_SECONDS, NETWORK, SCHEME, USDC_EXTRA } from "./constants";
import { endpointFetch, EndpointRefused } from "./endpoint";
import { verifyReceipt, type Receipt } from "./receipt";

export type ClientCredit = { id: string; payee: string; amountMicro: bigint };

export type RefusalCode =
  | "NOT_PAYABLE"
  | "PAYTO_MISMATCH"
  | "TOKEN_PIN"
  | "CHALLENGE_MISMATCH"
  | "ENDPOINT_REFUSED";

export class PaymentRefused extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly vars: Record<string, string> = {},
  ) {
    super(msg(code, vars));
    this.name = "PaymentRefused";
  }
}

type Signer = ConstructorParameters<typeof ExactEvmScheme>[0];

export type PayOptions = {
  account: Signer;
  url: string;
  usdc: string;
  /** True only when a paid or capped decision is stored for this credit. */
  decisionAllowsPay: (creditId: string) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
};

const sameAddress = (a: string, b: string) =>
  isAddress(a, { strict: false }) && isAddress(b, { strict: false }) && getAddress(a) === getAddress(b);

/** The challenge checks, in order. Returns the refusal code or null when the challenge is ours. */
export function checkChallenge(r: PaymentRequirements, credit: ClientCredit, usdc: string): RefusalCode | null {
  if (!sameAddress(r.payTo, credit.payee)) return "PAYTO_MISMATCH";
  if (!sameAddress(r.asset, usdc)) return "TOKEN_PIN";
  const extra = r.extra ?? {};
  const matches =
    r.scheme === SCHEME &&
    r.network === NETWORK &&
    /^\d+$/.test(r.amount) &&
    BigInt(r.amount) > BigInt(0) &&
    BigInt(r.amount) <= credit.amountMicro &&
    r.maxTimeoutSeconds > 0 &&
    r.maxTimeoutSeconds <= MAX_TIMEOUT_SECONDS &&
    extra.name === USDC_EXTRA.name &&
    extra.version === USDC_EXTRA.version &&
    (extra.assetTransferMethod === undefined || extra.assetTransferMethod === "eip3009");
  return matches ? null : "CHALLENGE_MISMATCH";
}

export async function payCredit(credit: ClientCredit, opts: PayOptions): Promise<{ tx: string; receipt: Receipt }> {
  const res = await gatedPay(credit, opts, opts.url);
  if (res.status === 409) throw new PaymentRefused("NOT_PAYABLE");
  if (!res.ok) throw new Error(`x402 payment for credit ${credit.id} failed with HTTP ${res.status}`);
  return readReceipt(res, credit);
}

export type MaintainerPayOptions = Omit<PayOptions, "url"> & { endpoint: string };

export type MaintainerReceipt = { endpoint: string; settlement: SettleResponse };

/** The maintainer's own endpoint for this credit: `amount` in micro-USDC and our credit id as `ref`. */
export function maintainerUrl(endpoint: string, credit: ClientCredit): string {
  const url = new URL(endpoint);
  url.searchParams.set("amount", credit.amountMicro.toString());
  url.searchParams.set("ref", credit.id);
  return url.toString();
}

/**
 * Pays a credit through the maintainer's own x402 endpoint (FUNDING.json `x402.endpoint`). The same
 * pre-sign gate as our route: the challenge's `payTo` must be the payee screened from FUNDING.json.
 * The endpoint is fetched through the SSRF guard unless a fetch is injected (tests).
 */
export async function payMaintainer(
  credit: ClientCredit,
  opts: MaintainerPayOptions,
): Promise<{ tx: string; receipt: MaintainerReceipt }> {
  const url = maintainerUrl(opts.endpoint, credit);
  let res: Response;
  try {
    res = await gatedPay(credit, { ...opts, fetch: opts.fetch ?? endpointFetch() }, url);
  } catch (err) {
    if (err instanceof EndpointRefused) {
      throw new PaymentRefused("ENDPOINT_REFUSED", { host: err.host, reason: ENDPOINT_REASONS[err.reason] });
    }
    throw err;
  }
  if (!res.ok) throw new Error(`x402 payment for credit ${credit.id} failed with HTTP ${res.status}`);
  const header = res.headers.get("PAYMENT-RESPONSE");
  const settlement = header ? decodeSettlement(header) : null;
  if (!settlement || !settlement.success || settlement.network !== NETWORK || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) {
    throw new Error(`x402 settlement for credit ${credit.id} is missing or not a Base Sepolia transaction`);
  }
  return { tx: settlement.transaction, receipt: { endpoint: opts.endpoint, settlement } };
}

function decodeSettlement(header: string): SettleResponse | null {
  try {
    return decodePaymentResponseHeader(header);
  } catch {
    return null;
  }
}

async function gatedPay(credit: ClientCredit, opts: Omit<PayOptions, "url">, url: string): Promise<Response> {
  let refused: RefusalCode | null = null;
  const client = new x402Client()
    .register(NETWORK, new ExactEvmScheme(opts.account))
    // Our hook below is the gate; the default $1 cap and asset allowlist would pre-empt its codes.
    .setSpendControls(false)
    .onBeforePaymentCreation(async ({ selectedRequirements }) => {
      refused = (await opts.decisionAllowsPay(credit.id))
        ? checkChallenge(selectedRequirements, credit, opts.usdc)
        : "NOT_PAYABLE";
      return refused ? { abort: true, reason: refused } : undefined;
    });

  const pay = wrapFetchWithPayment(opts.fetch ?? globalThis.fetch, client);
  try {
    return await pay(url);
  } catch (err) {
    if (refused) throw new PaymentRefused(refused);
    // Only eip155:84532 is registered, so a challenge on any other network fails selection.
    if (err instanceof Error && err.message.includes("No network/scheme registered")) {
      throw new PaymentRefused("CHALLENGE_MISMATCH");
    }
    throw err;
  }
}

async function readReceipt(res: Response, credit: ClientCredit): Promise<{ tx: string; receipt: Receipt }> {
  const receipt = (await res.json()) as Receipt;
  const header = res.headers.get("PAYMENT-RESPONSE");
  const tx = header ? decodePaymentResponseHeader(header).transaction : receipt.tx;
  const valid =
    receipt.creditId === credit.id &&
    receipt.tx === tx &&
    sameAddress(receipt.payee, credit.payee) &&
    (await verifyReceipt(receipt).catch(() => false));
  if (!valid) throw new Error(`x402 receipt for credit ${credit.id} does not match the payment`);
  return { tx, receipt };
}
