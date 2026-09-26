import { describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { payMaintainer, PaymentRefused } from "../../lib/x402/client";
import { handleTip, type TipjarConfig } from "./handler";

const HONEST = getAddress("0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3");
const CLIPPER = getAddress("0xfa064a16bDeD4C82aa6b3D4c656a640CeD547A13");
const USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const BASE = "https://tipjar.example.com";
const TX = `0x${"cd".repeat(32)}`;

function config() {
  const facilitator = {
    verify: vi.fn(async () => ({ isValid: true })),
    settle: vi.fn(async () => ({ success: true, transaction: TX, network: "eip155:84532" as const })),
  };
  const cfg: TipjarConfig = { honestPayTo: HONEST, clipperPayTo: CLIPPER, usdc: USDC, facilitator };
  return { cfg, facilitator };
}

const get = (path: string, cfg: TipjarConfig, headers: Record<string, string> = {}) =>
  handleTip(new Request(`${BASE}${path}`, { headers }), cfg);

async function challengeOf(res: Response) {
  expect(res.status).toBe(402);
  const header = decodePaymentRequiredHeader(res.headers.get("PAYMENT-REQUIRED")!);
  expect(await res.json()).toEqual(header);
  return header;
}

describe("tip jar 402 challenges", () => {
  it("the honest jar asks to be paid to HONEST_PAYTO in Base Sepolia USDC", async () => {
    const { cfg } = config();
    const c = await challengeOf(await get("/honest/tip?amount=10000&ref=c1", cfg));
    expect(c.x402Version).toBe(2);
    expect(c.resource.url).toBe(`${BASE}/honest/tip?amount=10000&ref=c1`);
    expect(c.accepts).toEqual([
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: USDC,
        amount: "10000",
        payTo: HONEST,
        maxTimeoutSeconds: 120,
        extra: { name: "USDC", version: "2" },
      },
    ]);
  });

  it("the clipper jar asks to be paid to CLIPPER_PAYTO, not its FUNDING.json address", async () => {
    const { cfg } = config();
    const c = await challengeOf(await get("/clipper/tip?amount=10000&ref=c1", cfg));
    expect(c.accepts[0].payTo).toBe(CLIPPER);
    expect(c.accepts[0].amount).toBe("10000");
  });

  it("rejects a missing, zero or oversized amount with 400", async () => {
    const { cfg } = config();
    for (const q of ["", "?amount=0", "?amount=1000001", "?amount=1e6", "?amount=-5"]) {
      expect((await get(`/honest/tip${q}`, cfg)).status, q).toBe(400);
    }
  });

  it("answers /health and 404s anything else", async () => {
    const { cfg } = config();
    expect(await (await get("/health", cfg)).json()).toEqual({ ok: true });
    expect((await get("/nope", cfg)).status).toBe(404);
  });

  it("rejects a payment signed for another payTo before the facilitator", async () => {
    const { cfg, facilitator } = config();
    const payment = { x402Version: 2, accepted: { scheme: "exact", network: "eip155:84532", asset: USDC, amount: "10000", payTo: CLIPPER }, payload: { authorization: { to: CLIPPER, value: "10000" } } };
    const header = Buffer.from(JSON.stringify(payment)).toString("base64");
    const res = await get("/honest/tip?amount=10000", cfg, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("CHALLENGE_MISMATCH");
    expect(facilitator.verify).not.toHaveBeenCalled();
  });
});

// The paying agent against this jar, in-process: the honest jar settles, the clipper never gets a signature.
describe("our agent against the tip jar", () => {
  const credit = { id: "c1", payee: HONEST, amountMicro: BigInt(10_000) };
  const signer = () => {
    const account = privateKeyToAccount(generatePrivateKey());
    return { address: account.address, signTypedData: vi.fn((a: Parameters<typeof account.signTypedData>[0]) => account.signTypedData(a)) };
  };

  it("pays the honest jar: verify and settle run and the tx comes back", async () => {
    const { cfg, facilitator } = config();
    const account = signer();
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => handleTip(new Request(input, init), cfg);
    const out = await payMaintainer(credit, { account, endpoint: `${BASE}/honest/tip`, usdc: USDC, decisionAllowsPay: async () => true, fetch });
    expect(out.tx).toBe(TX);
    expect(out.receipt.settlement).toMatchObject({ success: true, transaction: TX });
    expect(account.signTypedData).toHaveBeenCalledTimes(1);
    expect(facilitator.verify).toHaveBeenCalledTimes(1);
    expect(facilitator.settle).toHaveBeenCalledTimes(1);
  });

  it("refuses the clipper jar with PAYTO_MISMATCH: no signature, no settlement", async () => {
    const { cfg, facilitator } = config();
    const account = signer();
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => handleTip(new Request(input, init), cfg);
    const err = await payMaintainer(credit, { account, endpoint: `${BASE}/clipper/tip`, usdc: USDC, decisionAllowsPay: async () => true, fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentRefused);
    expect((err as PaymentRefused).code).toBe("PAYTO_MISMATCH");
    expect(account.signTypedData).not.toHaveBeenCalled();
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
  });
});
