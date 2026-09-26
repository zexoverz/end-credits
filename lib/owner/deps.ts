// Production chain reads and writes for the owner API: USDC `balanceOf` for the summary, and the
// escrow approver (reads, payer-signed `setApprover`) on Base Sepolia.
import { approverOf, approverState, setApprover, usdcBalance } from "../chain/escrow";
import { chain } from "../chain/keys";
import type { ApproverChain } from "./approver";
import type { SummaryDeps } from "./summary";

export function defaultSummaryDeps(): SummaryDeps {
  return { balanceOf: (address) => usdcBalance(address) };
}

export function defaultApproverChain(): ApproverChain {
  return {
    payer: () => chain().payer.account.address,
    approverOf: (payer) => approverOf(payer),
    approverState: (payer) => approverState(payer),
    setApprover: (address) => setApprover(address),
  };
}
