// Production chain reads and writes for the owner API: USDC `balanceOf` for the summary, and the
// escrow approver (reads, payer-signed `setApprover`), and the budget wallet reads on Base Sepolia.
import * as budget from "../chain/budget";
import { approverOf, approverState, setApprover, usdcBalance } from "../chain/escrow";
import { chain } from "../chain/keys";
import { chainForOwner } from "../chain/payers";
import { ownerRow } from "./settings";
import type { ApproverChain } from "./approver";
import type { BudgetChain } from "./budget";
import type { SummaryDeps } from "./summary";

export function defaultSummaryDeps(): SummaryDeps {
  return { balanceOf: (address) => usdcBalance(address), budget: defaultBudgetChain() };
}

/** The approver calls as `owner`'s payer key (the master key without an owner). */
export function defaultApproverChain(owner?: { id: string; payerAddress: string }): ApproverChain {
  const ctx = () => (owner ? chainForOwner(owner) : chain());
  return {
    payer: () => ctx().payer.account.address,
    approverOf: (payer) => approverOf(payer),
    approverState: (payer) => approverState(payer),
    setApprover: (address) => setApprover(address, ctx()),
  };
}

/** The approver chain for the signed-in owner. */
export async function ownerApproverChain(ownerId: string): Promise<ApproverChain> {
  const row = await ownerRow(ownerId);
  return defaultApproverChain(row ?? undefined);
}

/** EndCreditsBudget on Base Sepolia (BUDGET_ADDRESS); views pass the owner's payer as the spender. */
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
