// Live agent-to-agent check (decisions.md "Agent-to-agent x402"): the settler's maintainer payment
// path, `payMaintainer` through the SSRF guard, against the deployed tip jar. No DB: the stored
// paid decision is stood in by `decisionAllowsPay: true`. Pays 0.01 USDC on Base Sepolia to the
// honest jar, then shows the clipper jar refused before any signature. Not run in CI.
//
//   PAYER_PRIVATE_KEY=... pnpm tsx scripts/a2a-live.ts [tipjar base url]
//   (or PAYER_KEY_FILE=<path to a file holding the key>)
import { readFileSync } from "node:fs";
import { createPublicClient, erc20Abi, getAddress, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readEnv } from "../lib/env";
import { payMaintainer, PaymentRefused } from "../lib/x402/client";

const BASE = (process.argv[2] ?? "https://endcredits-tipjar.up.railway.app").replace(/\/+$/, "");
const PAYEE = getAddress("0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3"); // FUNDING.json drips ownedBy
const USDC = getAddress(process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const AMOUNT = BigInt(10_000);

async function main() {
  const keyFile = process.env.PAYER_KEY_FILE;
  const key = keyFile ? readFileSync(keyFile, "utf8").trim() : readEnv("PAYER_PRIVATE_KEY");
  const account = privateKeyToAccount(key as Hex);
  let signatures = 0;
  const signer = {
    address: account.address,
    signTypedData: (args: Parameters<typeof account.signTypedData>[0]) => {
      signatures++;
      return account.signTypedData(args);
    },
  };
  const gate = { account: signer, usdc: USDC, decisionAllowsPay: async () => true };

  const honest = await payMaintainer(
    { id: `a2a-live-${Date.now()}`, payee: PAYEE, amountMicro: AMOUNT },
    { ...gate, endpoint: `${BASE}/honest/tip` },
  );
  console.log(`honest: paid, tx ${honest.tx}, signatures ${signatures}`);
  const chain = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC) });
  const receipt = await chain.waitForTransactionReceipt({ hash: honest.tx as Hex });
  const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" }).filter(
    (l) => getAddress(l.address) === USDC,
  );
  for (const t of transfers) console.log(`honest: Transfer ${t.args.value} from ${t.args.from} to ${t.args.to}, block ${receipt.blockNumber}, status ${receipt.status}`);

  const before = signatures;
  try {
    await payMaintainer(
      { id: `a2a-live-clipper-${Date.now()}`, payee: PAYEE, amountMicro: AMOUNT },
      { ...gate, endpoint: `${BASE}/clipper/tip` },
    );
    console.log("clipper: PAID (unexpected)");
    process.exit(1);
  } catch (err) {
    if (!(err instanceof PaymentRefused)) throw err;
    console.log(`clipper: refused ${err.code}: ${err.message} signatures during clipper: ${signatures - before}`);
    if (err.code !== "PAYTO_MISMATCH" || signatures !== before) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
