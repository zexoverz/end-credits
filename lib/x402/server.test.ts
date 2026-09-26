import { describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { handleCreditRequest, type CreditRepo, type PayableCredit, type PayerScreen } from "./server";
import { verifyReceipt, type Receipt } from "./receipt";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYEE = getAddress("0x00000000000000000000000000000000000000aa");
const NOW = new Date("2026-09-26T12:00:00Z");
const URL_ = "https://end-credits.up.railway.app/api/x402/credit/c1";
const receiptSigner = privateKeyToAccount(generatePrivateKey());
const PAYER = getAddress("0x00000000000000000000000000000000000000bb");

function credit(over: Partial<PayableCredit> = {}): PayableCredit {
  return {
    id: "c1",
    packageName: "zod",
    sessionId: "5f1c2a9e-0000-4000-8000-000000000000",
    amountMicro: BigInt(10_000),
    payee: PAYEE,
    outcome: "paid",
    txHash: null,
    receipt: null,
    ...over,
  };
}

// In-memory repository, tests only. Screens are keyed by lowercase address.
function memoryRepo(c: PayableCredit | null, screens: Record<string, Date> = {}) {
  const saved: { id: string; tx: string; receipt: Receipt }[] = [];
  const screenIds: string[] = [];
  const repo: CreditRepo = {
    loadCredit: async (id) => (c && c.id === id ? c : null),
    latestAddressScreenAt: async (address) => screens[address.toLowerCase()] ?? null,
    saveSettlement: async (id, tx, receipt) => {
      saved.push({ id, tx, receipt });
    },
    addScreenId: async (_id, screenId) => {
      screenIds.push(screenId);
    },
  };
  return { repo, saved, screenIds };
}

const fresh = { [PAYEE.toLowerCase()]: new Date(NOW.getTime() - 60_000) };

function fakeFacilitator(opts: { valid?: boolean; settled?: boolean } = {}) {
  return {
    verify: vi.fn(async (_p: PaymentPayload, _r: PaymentRequirements) => ({ isValid: opts.valid ?? true, invalidReason: "invalid_signature" })),
    settle: vi.fn(async () => ({
      success: opts.settled ?? true,
      transaction: "0xfeed",
      network: "eip155:84532" as const,
      payer: "0x00000000000000000000000000000000000000bb",
    })),
  };
}

const cleanPayer: PayerScreen = { ok: true, data: { toxicScore: 0, traits: [] }, screenId: "payer-screen" };

function deps(repo: CreditRepo, facilitator = fakeFacilitator(), payer: PayerScreen = cleanPayer) {
  const screenPayer = vi.fn(async () => payer);
  return { repo, facilitator, usdc: USDC, receiptSigner, now: () => NOW, screenPayer };
}

function request(paymentHeader: string | null = null) {
  return { creditId: "c1", resourceUrl: URL_, paymentHeader };
}

function paymentFor(accepted: PaymentRequirements): string {
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted,
    payload: {
      signature: "0x01",
      authorization: { from: PAYER, to: accepted.payTo, value: accepted.amount },
    },
  };
  return encodePaymentSignatureHeader(payload);
}

async function challengeOf(res: Response) {
  return decodePaymentRequiredHeader(res.headers.get("PAYMENT-REQUIRED")!);
}

describe("x402 credit resource: refuses to quote", () => {
  it("returns 409 NOT_PAYABLE for a held credit", async () => {
    const { repo } = memoryRepo(credit({ outcome: "held" }), fresh);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_PAYABLE");
  });

  it("returns 409 NOT_PAYABLE for a refused credit", async () => {
    const { repo } = memoryRepo(credit({ outcome: "refused" }), fresh);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_PAYABLE");
  });

  it("returns 409 NOT_PAYABLE when the payee screen is older than 10 minutes", async () => {
    const stale = { [PAYEE.toLowerCase()]: new Date(NOW.getTime() - 10 * 60_000 - 1) };
    const { repo } = memoryRepo(credit(), stale);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_PAYABLE");
  });

  it("returns 409 NOT_PAYABLE when the payee was never screened", async () => {
    const { repo } = memoryRepo(credit(), {});
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(409);
  });

  it("never reaches the facilitator for a held credit, even with a payment", async () => {
    const { repo } = memoryRepo(credit({ outcome: "held" }), fresh);
    const facilitator = fakeFacilitator();
    const res = await handleCreditRequest(request("x"), deps(repo, facilitator));
    expect(res.status).toBe(409);
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown credit", async () => {
    const { repo } = memoryRepo(null, fresh);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(404);
  });
});

describe("x402 credit resource: challenge", () => {
  it("returns 402 with the exact v2 challenge for a paid credit with a fresh screen", async () => {
    const { repo } = memoryRepo(credit(), fresh);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(402);
    const challenge = await challengeOf(res);
    expect(challenge.x402Version).toBe(2);
    expect(challenge.resource).toEqual({ url: URL_, description: "End Credits: zod, session 5f1c2a9e" });
    expect(challenge.accepts).toEqual([
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: USDC,
        amount: "10000",
        payTo: PAYEE,
        maxTimeoutSeconds: 120,
        extra: { name: "USDC", version: "2" },
      },
    ]);
  });

  it("quotes a capped credit", async () => {
    const { repo } = memoryRepo(credit({ outcome: "capped" }), fresh);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(402);
  });

  it("matches the screen whatever the case of the stored payee", async () => {
    const { repo } = memoryRepo(credit({ payee: PAYEE.toLowerCase() }), fresh);
    const res = await handleCreditRequest(request(), deps(repo));
    expect(res.status).toBe(402);
    expect((await challengeOf(res)).accepts[0].payTo).toBe(PAYEE);
  });
});

describe("x402 credit resource: settlement", () => {
  it("returns the stored receipt for a settled credit without touching the facilitator", async () => {
    const stored = { creditId: "c1", tx: "0xfeed" } as unknown as Receipt;
    const { repo } = memoryRepo(credit({ txHash: "0xfeed", receipt: stored }), {});
    const facilitator = fakeFacilitator();
    const res = await handleCreditRequest(request(), deps(repo, facilitator));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(stored);
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("verifies, settles, stores and returns a signed receipt", async () => {
    const { repo, saved } = memoryRepo(credit(), fresh);
    const facilitator = fakeFacilitator();
    const quote = await challengeOf(await handleCreditRequest(request(), deps(repo)));
    const res = await handleCreditRequest(request(paymentFor(quote.accepts[0])), deps(repo, facilitator));
    expect(res.status).toBe(200);
    const receipt = (await res.json()) as Receipt;
    expect(receipt).toMatchObject({ creditId: "c1", package: "zod", amount: "10000", payee: PAYEE, tx: "0xfeed" });
    expect(receipt.signer).toBe(receiptSigner.address);
    expect(await verifyReceipt(receipt)).toBe(true);
    expect(saved).toEqual([{ id: "c1", tx: "0xfeed", receipt }]);
    expect(decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!).transaction).toBe("0xfeed");
    // The facilitator checks the payment against our requirements, not the client's copy.
    expect(facilitator.verify.mock.calls[0][1]).toEqual(quote.accepts[0]);
  });

  it("rejects a payment whose payTo differs from the credit before calling the facilitator", async () => {
    const { repo, saved } = memoryRepo(credit(), fresh);
    const facilitator = fakeFacilitator();
    const quote = await challengeOf(await handleCreditRequest(request(), deps(repo)));
    const other = { ...quote.accepts[0], payTo: getAddress("0x00000000000000000000000000000000000000cc") };
    const res = await handleCreditRequest(request(paymentFor(other)), deps(repo, facilitator));
    expect(res.status).toBe(402);
    expect((await challengeOf(res)).error).toBe("CHALLENGE_MISMATCH");
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("rejects a payment for a smaller amount than the credit", async () => {
    const { repo } = memoryRepo(credit(), fresh);
    const facilitator = fakeFacilitator();
    const quote = await challengeOf(await handleCreditRequest(request(), deps(repo)));
    const less = { ...quote.accepts[0], amount: "9999" };
    const res = await handleCreditRequest(request(paymentFor(less)), deps(repo, facilitator));
    expect(res.status).toBe(402);
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("does not settle a payment the facilitator rejects", async () => {
    const { repo, saved } = memoryRepo(credit(), fresh);
    const facilitator = fakeFacilitator({ valid: false });
    const quote = await challengeOf(await handleCreditRequest(request(), deps(repo)));
    const res = await handleCreditRequest(request(paymentFor(quote.accepts[0])), deps(repo, facilitator));
    expect(res.status).toBe(402);
    expect((await challengeOf(res)).error).toBe("invalid_signature");
    expect(facilitator.settle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("stores nothing when settlement fails", async () => {
    const { repo, saved } = memoryRepo(credit(), fresh);
    const facilitator = fakeFacilitator({ settled: false });
    const quote = await challengeOf(await handleCreditRequest(request(), deps(repo)));
    const res = await handleCreditRequest(request(paymentFor(quote.accepts[0])), deps(repo, facilitator));
    expect(res.status).toBe(402);
    expect(saved).toEqual([]);
  });

  it("answers a malformed payment header with a fresh 402", async () => {
    const { repo } = memoryRepo(credit(), fresh);
    const res = await handleCreditRequest(request("not-base64-json"), deps(repo));
    expect(res.status).toBe(402);
    expect((await challengeOf(res)).error).toBe("INVALID_PAYMENT");
  });
});

describe("x402 credit resource: screens the paying wallet", () => {
  async function pay(payer: PayerScreen) {
    const { repo, saved, screenIds } = memoryRepo(credit(), fresh);
    const facilitator = fakeFacilitator();
    const d = deps(repo, facilitator, payer);
    const challenge = await challengeOf(await handleCreditRequest(request(), d));
    const res = await handleCreditRequest(request(paymentFor(challenge.accepts[0])), d);
    return { res, facilitator, saved, screenIds, screenPayer: d.screenPayer };
  }

  it("refuses a sanctioned payer with 403 and never settles", async () => {
    const sanctioned: PayerScreen = {
      ok: true,
      data: { toxicScore: 100, traits: [{ name: "sanction_address", description: "The address is officially listed as sanctioned." }] },
      screenId: "s-sanctioned",
    };
    const { res, facilitator, saved, screenIds, screenPayer } = await pay(sanctioned);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      code: "PAYER_REFUSED",
      message: "Refused: Intercepta flags the paying wallet. The address is officially listed as sanctioned.",
    });
    expect(screenPayer).toHaveBeenCalledWith(PAYER);
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(screenIds).toEqual(["s-sanctioned"]);
  });

  it("refuses a payer scored above 50 with no critical trait", async () => {
    const toxic: PayerScreen = { ok: true, data: { toxicScore: 60, traits: [] }, screenId: "s-toxic" };
    const { res, facilitator } = await pay(toxic);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("Refused: Intercepta flags the paying wallet. Toxic score 60.");
    expect(facilitator.settle).not.toHaveBeenCalled();
  });

  it("answers 503 when the payer screen fails and never settles", async () => {
    const { res, facilitator, saved } = await pay({ ok: false, error: "TIMEOUT", screenId: "s-timeout" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: "PAYER_SCREEN_UNAVAILABLE",
      message: "Not settled: the paying wallet could not be screened (TIMEOUT). Nothing was settled.",
    });
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("settles for a clean payer and records its screen", async () => {
    const { res, facilitator, saved, screenIds } = await pay(cleanPayer);
    expect(res.status).toBe(200);
    expect(facilitator.settle).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
    expect(screenIds).toEqual(["payer-screen"]);
  });

  it("settles for a payer with no mainnet history", async () => {
    const fresh: PayerScreen = { ok: true, data: { toxicScore: 0, traits: [], noHistory: true }, screenId: "s-new" };
    const { res, facilitator } = await pay(fresh);
    expect(res.status).toBe(200);
    expect(facilitator.settle).toHaveBeenCalledTimes(1);
  });
});
