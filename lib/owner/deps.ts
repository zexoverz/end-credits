// Production chain reads and writes for the owner API: USDC `balanceOf` for the summary, and the
// escrow approver (reads, payer-signed `setApprover`), and the budget wallet reads on Base Sepolia.
import * as budget from "../chain/budget";
import { approverOf, approverState, setApprover, usdcBalance } from "../chain/escrow";
import { chain } from "../chain/keys";
import type { ApproverChain } from "./approver";
import type { BudgetChain } from "./budget";
import type { SummaryDeps } from "./summary";

export function defaultSummaryDeps(): SummaryDeps {
  return { balanceOf: (address) => usdcBalance(address), budget: defaultBudgetChain() };
}

export function defaultApproverChain(): ApproverChain {
  return {
    payer: () => chain().payer.account.address,
    approverOf: (payer) => approverOf(payer),
    approverState: (payer) => approverState(payer),
    setApprover: (address) => setApprover(address),
  };
}

/** EndCreditsBudget on Base Sepolia (BUDGET_ADDRESS); the spender is our payer (hot) key. */
export function defaultBudgetChain(): BudgetChain {
  const at = () => budget.budgetAddress() ?? undefined;
  return {
    address: () => budget.budgetAddress(),
    spender: () => chain().payer.account.address,
    usdc: () => chain().usdc,
    usdcBalance: (owner) => budget.usdcBalance(owner),
    usdcAllowanceToBudget: (owner) => budget.usdcAllowanceToBudget(owner, chain(), at()),
    allowanceOf: (owner, spender) => budget.allowanceOf(owner, spender, chain(), at()),
    remaining: (owner, spender) => budget.remaining(owner, spender, chain(), at()),
  };
}
