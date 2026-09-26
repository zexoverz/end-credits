// Live check of the payment simulation: one Intercepta request, nothing written to the database.
//
//   INTERCEPTA_API_KEY="$(cat ~/.config/dominion/intercepta-key)" \
//   INTERCEPTA_BASE=https://api.web3antivirus.io pnpm tsx scripts/simulate-payment.ts [payee] [amountMicro]
//
// Defaults to zod's tea.yaml payee and 0.25 USDC. The key is read from env and never printed.
import { formatUnits, type Address } from "viem";
import type { ScreenRepo } from "../lib/intercepta/cache";
import { createIntercepta } from "../lib/intercepta/client";
import { applySimulation } from "../lib/decision/simulation";
import type { Decision } from "../lib/decision/types";
import { readEnv } from "../lib/env";
import { msg } from "../lib/messages";

const PAYER: Address = "0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6";
const payee = (process.argv[2] ?? "0xF233A42130Bcdd8b22FFB5D9593199f31C3Eeb87") as Address;
const amount = BigInt(process.argv[3] ?? "250000");

async function main() {
  const rows: unknown[] = [];
  const repo: ScreenRepo = {
    latestOk: async () => null, // always a real request
    insert: async (row) => {
      rows.push(row);
      return `live-${rows.length}`;
    },
  };
  const intercepta = createIntercepta({ base: readEnv("INTERCEPTA_BASE"), apiKey: readEnv("INTERCEPTA_API_KEY"), repo });
  const sim = await intercepta.simulatePayment({ payer: PAYER, payee, amount });
  const paid: Decision = { outcome: "paid", reasons: [{ source: "policy", code: "PAID", text: msg("PAID", { amount: formatUnits(amount, 6) }) }] };
  const decision = applySimulation(paid, sim, { payee, amount });
  console.log(JSON.stringify({ stored: rows, result: sim, decision }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.name : "error");
  process.exit(1);
});
