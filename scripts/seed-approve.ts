// Payer approves the escrow for 1000 USDC (DESIGN §7 setup). Run once after deploy:
// `pnpm tsx scripts/seed-approve.ts` with BASE_SEPOLIA_RPC, PAYER_PRIVATE_KEY, RECORDER_PRIVATE_KEY,
// USDC_ADDRESS, ESCROW_ADDRESS set. Skips when the allowance is already enough.
import { formatUnits } from "viem";
import { allowance, approveEscrow, usdcBalance } from "../lib/chain/escrow";
import { chainFromEnv } from "../lib/chain/keys";

const AMOUNT = BigInt(1000) * BigInt(1_000_000);

async function main() {
  const ctx = chainFromEnv();
  const payer = ctx.payer.account.address;
  const current = await allowance(undefined, ctx);
  console.log(`payer ${payer} -> escrow ${ctx.escrow}`);
  console.log(`balance ${formatUnits(await usdcBalance(undefined, ctx), 6)} USDC`);
  if (current >= AMOUNT) {
    console.log(`allowance already ${formatUnits(current, 6)} USDC, nothing to do`);
    return;
  }
  const hash = await approveEscrow(AMOUNT, ctx);
  console.log(`approve tx ${hash}`);
  console.log(`allowance now ${formatUnits(await allowance(undefined, ctx), 6)} USDC`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
