// One real x402 exact-scheme payment of 0.01 USDC on Base Sepolia through the public facilitator,
// with the credit resource logic served in-process on a random port and an in-memory credit
// (no DB, no Intercepta). Not run in CI.
//
//   PAYER_PRIVATE_KEY=... RECEIPT_SIGNING_KEY=... pnpm tsx scripts/x402-smoke.ts <payee>
//   optional: BASE_SEPOLIA_RPC, USDC_ADDRESS, X402_FACILITATOR_URL
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { readEnv } from "../lib/env";
import { payCredit } from "../lib/x402/client";
import { DEFAULT_FACILITATOR_URL } from "../lib/x402/constants";
import type { Receipt } from "../lib/x402/receipt";
import { handleCreditRequest, type CreditRepo, type PayableCredit } from "../lib/x402/server";

const AMOUNT = BigInt(10_000); // 0.01 USDC

async function main() {
  const payee = getAddress(process.argv[2] ?? "");
  const usdc = getAddress(process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  const payer = privateKeyToAccount(readEnv("PAYER_PRIVATE_KEY") as Hex);
  const receiptSigner = privateKeyToAccount(readEnv("RECEIPT_SIGNING_KEY") as Hex);
  const chain = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC) });

  const credit: PayableCredit = {
    id: randomUUID(),
    packageName: "@endcredits-demo/smoke",
    sessionId: randomUUID(),
    amountMicro: AMOUNT,
    payee,
    outcome: "paid",
    txHash: null,
    receipt: null,
  };
  const repo: CreditRepo = {
    loadCredit: async (id) => (id === credit.id ? credit : null),
    latestAddressScreenAt: async () => new Date(), // stands in for a fresh Intercepta screen
    saveSettlement: async (_id, tx, receipt: Receipt) => {
      credit.txHash = tx;
      credit.receipt = receipt;
    },
    addScreenId: async () => {},
  };
  // Stands in for Intercepta's payer screen: this script tests x402 settlement, not screening.
  const screenPayer = async () => ({ ok: true as const, data: { toxicScore: 0, traits: [] }, screenId: randomUUID() });
  const facilitator = new HTTPFacilitatorClient({
    url: process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
  });

  const server = createServer(async (req, res) => {
    const id = (req.url ?? "").split("/").pop() ?? "";
    const header = req.headers["payment-signature"];
    const out = await handleCreditRequest(
      { creditId: id, resourceUrl: url, paymentHeader: typeof header === "string" ? header : null },
      { repo, facilitator, usdc, receiptSigner, screenPayer },
    );
    res.writeHead(out.status, Object.fromEntries(out.headers.entries()));
    res.end(await out.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/x402/credit/${credit.id}`;

  console.log(`payer ${payer.address} pays ${formatUnits(AMOUNT, 6)} USDC to ${payee}`);
  try {
    const { tx, receipt } = await payCredit(
      { id: credit.id, payee, amountMicro: AMOUNT },
      { account: payer, url, usdc, decisionAllowsPay: async (id) => id === credit.id && credit.outcome === "paid" },
    );
    const mined = await chain.waitForTransactionReceipt({ hash: tx as Hex });
    // Read the Transfer from the receipt; a load-balanced RPC can serve balanceOf from a lagging node.
    const moved = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: mined.logs }).find(
      (l) => getAddress(l.address) === usdc && getAddress(l.args.to) === payee,
    );
    console.log(`tx ${tx} status ${mined.status} block ${mined.blockNumber}`);
    console.log(`USDC Transfer to payee: ${moved ? formatUnits(moved.args.value, 6) : "none found"}`);
    console.log(`receipt signed by ${receipt.signer}`);
    console.log(`https://sepolia.basescan.org/tx/${tx}`);
  } finally {
    server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
