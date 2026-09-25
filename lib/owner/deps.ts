// Production balance read for the owner summary: USDC `balanceOf` on Base Sepolia.
import { usdcBalance } from "../chain/escrow";
import type { SummaryDeps } from "./summary";

export function defaultSummaryDeps(): SummaryDeps {
  return { balanceOf: (address) => usdcBalance(address) };
}
