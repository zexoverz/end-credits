import { describe, expect, it, vi } from "vitest";
import { getAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { payCredit, PaymentRefused, type ClientCredit } from "./client";
import { signReceipt } from "./receipt";
import { handleCreditRequest, type CreditRepo, type PayableCredit } from "./server";
import { msg } from "../messages";

const USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const PAYEE = getAddress("0x00000000000000000000000000000000000000aa");
const URL_ = "https://end-credits.test/api/x402/credit/c1";
const receiptKey = privateKeyToAccount(generatePrivateKey());
const credit: ClientCredit = { id: "c1", payee: PAYEE, amountMicro: BigInt(10_000) };

// A viem LocalAccount wrapper that counts signTypedData calls (tests only).
function spySigner() {
  const account = privateKeyToAccount(generatePrivateKey());
  const signTypedData = vi.fn((args: Parameters<typeof account.signTypedData>[0]) =>
    account.signTypedData(args),
  );
  return { address: account.address, signTypedData } as const;
}

function requirements(over: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:84532",
    asset: USDC,
    amount: "10000",
    payTo: PAYEE,
    maxTimeoutSeconds: 120,
    extra: { name: "USDC", version: "2" },
    ...over,
  };
}

// Fake x402 resource (tests only): 402 with the given accepts, then a receipt for any payment.
function fake402(accept: PaymentRequirements) {
  const payments: PaymentPayload[] = [];
  const challenge: PaymentRequired = {
    x402Version: 2,
    resource: { url: URL_, description: "End Credits: zod, session 5f1c2a9e" },
    accepts: [accept],
  };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const header = req.headers.get("PAYMENT-SIGNATURE");
    if (!header) {
      return new Response("{}", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge) },
      });
    }
    payments.push(decodePaymentSignatureHeader(header));
    const receipt = await signReceipt(
      { creditId: "c1", package: "zod", amount: accept.amount, payee: accept.payTo, tx: "0xfeed" },
      receiptKey,
    );
    const settle = { success: true, transaction: "0xfeed", network: "eip155:84532" as const };
    return Response.json(receipt, { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settle) } });
  });
  return { fetchImpl, payments };
}

const allow = async () => true;

async function refusal(p: Promise<unknown>): Promise<PaymentRefused> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PaymentRefused);
  return err as PaymentRefused;
}

describe("payCredit pre-sign checks", () => {
  it("never signs when no paid decision is stored for the credit", async () => {
    const signer = spySigner();
    const { fetchImpl, payments } = fake402(requirements());
    const decisionAllowsPay = vi.fn(async () => false);
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay, fetch: fetchImpl }),
    );
    expect(err.code).toBe("NOT_PAYABLE");
    expect(err.message).toBe(msg("NOT_PAYABLE"));
    expect(decisionAllowsPay).toHaveBeenCalledWith("c1");
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(payments).toHaveLength(0);
  });

  it("refuses a swapped payTo with PAYTO_MISMATCH and never signs", async () => {
    const signer = spySigner();
    const swapped = getAddress("0x00000000000000000000000000000000000000cc");
    const { fetchImpl, payments } = fake402(requirements({ payTo: swapped }));
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay: allow, fetch: fetchImpl }),
    );
    expect(err.code).toBe("PAYTO_MISMATCH");
    expect(err.message).toBe(msg("PAYTO_MISMATCH"));
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(payments).toHaveLength(0);
  });

  it("refuses another token with TOKEN_PIN", async () => {
    const signer = spySigner();
    const other = getAddress("0x00000000000000000000000000000000000000dd");
    const { fetchImpl } = fake402(requirements({ asset: other }));
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay: allow, fetch: fetchImpl }),
    );
    expect(err.code).toBe("TOKEN_PIN");
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("refuses an amount above the allocation with CHALLENGE_MISMATCH", async () => {
    const signer = spySigner();
    const { fetchImpl } = fake402(requirements({ amount: "10001" }));
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay: allow, fetch: fetchImpl }),
    );
    expect(err.code).toBe("CHALLENGE_MISMATCH");
    expect(err.message).toBe(msg("CHALLENGE_MISMATCH"));
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("refuses another network with CHALLENGE_MISMATCH", async () => {
    const signer = spySigner();
    const { fetchImpl } = fake402(requirements({ network: "eip155:8453" }));
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay: allow, fetch: fetchImpl }),
    );
    expect(err.code).toBe("CHALLENGE_MISMATCH");
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("refuses a different EIP-712 domain with CHALLENGE_MISMATCH", async () => {
    const signer = spySigner();
    const { fetchImpl } = fake402(requirements({ extra: { name: "USD Coin", version: "2" } }));
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay: allow, fetch: fetchImpl }),
    );
    expect(err.code).toBe("CHALLENGE_MISMATCH");
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });
});

describe("payCredit happy path", () => {
  it("signs once, sends the payment header and returns tx and receipt", async () => {
    const signer = spySigner();
    const { fetchImpl, payments } = fake402(requirements());
    const result = await payCredit(credit, {
      account: signer,
      url: URL_,
      usdc: USDC,
      decisionAllowsPay: allow,
      fetch: fetchImpl,
    });
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
    expect(payments[0].accepted.payTo).toBe(PAYEE);
    expect((payments[0].payload.authorization as { to: Hex }).to).toBe(PAYEE);
    expect(result.tx).toBe("0xfeed");
    expect(result.receipt).toMatchObject({ creditId: "c1", tx: "0xfeed", signer: receiptKey.address });
  });

  it("pays against the real resource logic in-process", async () => {
    const signer = spySigner();
    const row: PayableCredit = {
      id: "c1",
      packageName: "zod",
      sessionId: "5f1c2a9e-0000-4000-8000-000000000000",
      amountMicro: BigInt(10_000),
      payee: PAYEE,
      outcome: "paid",
      txHash: null,
      receipt: null,
    };
    const repo: CreditRepo = {
      loadCredit: async () => row,
      latestAddressScreenAt: async () => new Date(),
      saveSettlement: async () => {},
    };
    const facilitator = {
      verify: async () => ({ isValid: true }),
      settle: async () => ({ success: true, transaction: "0xbeef", network: "eip155:84532" as const }),
    };
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      return handleCreditRequest(
        { creditId: "c1", resourceUrl: URL_, paymentHeader: req.headers.get("PAYMENT-SIGNATURE") },
        { repo, facilitator, usdc: USDC, receiptSigner: receiptKey },
      );
    };
    const result = await payCredit(credit, {
      account: signer,
      url: URL_,
      usdc: USDC,
      decisionAllowsPay: allow,
      fetch: fetchImpl,
    });
    expect(result.tx).toBe("0xbeef");
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
  });

  it("maps a 409 from the resource to NOT_PAYABLE without signing", async () => {
    const signer = spySigner();
    const fetchImpl = async () => Response.json({ code: "NOT_PAYABLE" }, { status: 409 });
    const err = await refusal(
      payCredit(credit, { account: signer, url: URL_, usdc: USDC, decisionAllowsPay: allow, fetch: fetchImpl }),
    );
    expect(err.code).toBe("NOT_PAYABLE");
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });
});
