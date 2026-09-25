// Settler-side x402 client (DESIGN §10, AGENTS rules 6 and 8). Nothing is signed unless a paid or
// capped decision is stored for the credit and the 402 challenge matches what was screened.
import { getAddress, isAddress } from "viem";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { msg } from "../messages";
import { MAX_TIMEOUT_SECONDS, NETWORK, SCHEME, USDC_EXTRA } from "./constants";
import { verifyReceipt, type Receipt } from "./receipt";

export type ClientCredit = { id: string; payee: string; amountMicro: bigint };

export type RefusalCode = "NOT_PAYABLE" | "PAYTO_MISMATCH" | "TOKEN_PIN" | "CHALLENGE_MISMATCH";

export class PaymentRefused extends Error {
  constructor(readonly code: RefusalCode) {
    super(msg(code));
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
  let res: Response;
  try {
    res = await pay(opts.url);
  } catch (err) {
    if (refused) throw new PaymentRefused(refused);
    // Only eip155:84532 is registered, so a challenge on any other network fails selection.
    if (err instanceof Error && err.message.includes("No network/scheme registered")) {
      throw new PaymentRefused("CHALLENGE_MISMATCH");
    }
    throw err;
  }
  if (res.status === 409) throw new PaymentRefused("NOT_PAYABLE");
  if (!res.ok) throw new Error(`x402 payment for credit ${credit.id} failed with HTTP ${res.status}`);
  return readReceipt(res, credit);
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
