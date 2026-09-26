// The owner's budget wallet (EndCreditsBudget, spend limits). The owner's USDC stays in their own
// wallet; they approve USDC to the budget contract and give our hot key an allowance per period
// from that wallet. We only store which wallet it is (`owners.budget_owner`) and read the rest from
// chain. USDC amounts are decimal strings at the edge.
import { eq } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import type { BudgetAllowance } from "../chain/budget";
import { db } from "../db/client";
import { owners } from "../db/schema";
import { formatUsdc } from "../money";
import { ownerRow } from "./settings";

export interface BudgetChain {
  /** The EndCreditsBudget address, or null when BUDGET_ADDRESS is not set. */
  address(): Address | null;
  /** The hot key the owner's allowance is for. */
  spender(): Address;
  /** The USDC the owner approves to the budget contract. */
  usdc(): Address;
  usdcBalance(owner: Address): Promise<bigint>;
  usdcAllowanceToBudget(owner: Address): Promise<bigint>;
  allowanceOf(owner: Address, spender: Address): Promise<BudgetAllowance | null>;
  remaining(owner: Address, spender: Address): Promise<bigint>;
}

export interface BudgetView {
  budgetAddress: string | null;
  /** The USDC token the wallet approves (for the browser's approve call). */
  usdc: string | null;
  budgetOwner: string | null;
  spender: string | null;
  usdcBalance: string | null;
  usdcAllowanceToBudget: string | null;
  allowance: {
    perPeriod: string;
    /** Seconds. */
    period: number;
    periodStart: string;
    spentInPeriod: string;
    remaining: string;
  } | null;
  error: "rpc_unavailable" | null;
}

const READ_TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), READ_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Chain state for `budgetOwner` and `payer`, the owner's own payer key (the spender it allows);
 * never throws (an RPC error text can carry the provider key).
 */
export async function budgetView(budgetOwner: string | null, chain: BudgetChain, payer?: string): Promise<BudgetView> {
  const empty: BudgetView = {
    budgetAddress: null,
    usdc: null,
    budgetOwner,
    spender: null,
    usdcBalance: null,
    usdcAllowanceToBudget: null,
    allowance: null,
    error: null,
  };
  let address: Address | null;
  let spender: Address;
  let usdc: Address;
  try {
    address = chain.address();
    spender = payer ? getAddress(payer) : chain.spender();
    usdc = chain.usdc();
  } catch {
    return { ...empty, error: "rpc_unavailable" };
  }
  const base = { ...empty, budgetAddress: address, usdc, spender };
  if (!address || !budgetOwner) return base;
  const owner = budgetOwner as Address;
  try {
    const [balance, approved, allowance, left] = await withTimeout(
      Promise.all([
        chain.usdcBalance(owner),
        chain.usdcAllowanceToBudget(owner),
        chain.allowanceOf(owner, spender),
        chain.remaining(owner, spender),
      ]),
    );
    return {
      ...base,
      usdcBalance: formatUsdc(balance),
      usdcAllowanceToBudget: formatUsdc(approved),
      allowance: allowance && {
        perPeriod: formatUsdc(allowance.perPeriod),
        period: Number(allowance.period),
        periodStart: new Date(Number(allowance.periodStart) * 1000).toISOString(),
        spentInPeriod: formatUsdc(allowance.spentInPeriod),
        remaining: formatUsdc(left),
      },
    };
  } catch {
    return { ...base, error: "rpc_unavailable" };
  }
}

export async function getBudget(ownerId: string, chain: BudgetChain): Promise<BudgetView | null> {
  const row = await ownerRow(ownerId);
  return row ? budgetView(row.budgetOwner, chain, row.payerAddress) : null;
}

/** Stores the owner's funding wallet, checksummed. */
export async function setBudgetOwner(ownerId: string, address: string, chain: BudgetChain): Promise<BudgetView | null> {
  const budgetOwner = getAddress(address);
  const [row] = await db()
    .update(owners)
    .set({ budgetOwner })
    .where(eq(owners.id, ownerId))
    .returning({ budgetOwner: owners.budgetOwner, payerAddress: owners.payerAddress });
  return row ? budgetView(row.budgetOwner, chain, row.payerAddress) : null;
}
