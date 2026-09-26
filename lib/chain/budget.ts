// Typed calls into EndCreditsBudget (spend limits on the owner's own USDC). The hot key (our payer
// key, now only a spender) pulls through the same per-key tx queue as its escrow writes, so nonces
// never collide. A revert throws TxRevertedError named `OverPeriodCap`, `NoAllowance`, or the USDC
// error when the owner's approval or balance is short.
import { parseAbi, type Abi, type Address, type Hash } from "viem";
import { readEnv } from "../env";
import { budgetAbi, erc20Abi } from "./abi";
import { queueFor } from "./escrow";
import { chain, type ChainContext } from "./keys";

type Env = Record<string, string | undefined>;

// USDC errors a pull can bubble up: OpenZeppelin ERC20 custom errors (MockUSDC on anvil). Circle's
// FiatToken reverts with a string, which the queue reads as the reason.
const usdcErrors = parseAbi([
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
]);
const pullAbi = [...budgetAbi, ...usdcErrors] as Abi;

/** BUDGET_ADDRESS, or null when the budget contract is not configured. */
export function budgetAddress(env: Env = process.env): Address | null {
  return env.BUDGET_ADDRESS ? (readEnv("BUDGET_ADDRESS", env) as Address) : null;
}

const required = (budget?: Address) => budget ?? (readEnv("BUDGET_ADDRESS") as Address);

/** Hot key pulls `amount` of `owner`'s USDC to itself, within its allowance for this window. */
export function pull(owner: Address, amount: bigint, ctx: ChainContext = chain(), budget?: Address): Promise<Hash> {
  return queueFor(ctx).submit(ctx.payer.account.address, {
    address: required(budget),
    abi: pullAbi,
    functionName: "pull",
    args: [owner, amount],
  });
}

/** What `spender` (default: the hot key) can still pull from `owner` in the current window. */
export function remaining(owner: Address, spender?: Address, ctx: ChainContext = chain(), budget?: Address): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: required(budget),
    abi: budgetAbi,
    functionName: "remaining",
    args: [owner, spender ?? ctx.payer.account.address],
  });
}

export interface BudgetAllowance {
  perPeriod: bigint;
  period: bigint;
  periodStart: bigint;
  spentInPeriod: bigint;
}

/** The stored allowance (window not rolled forward); null when none is set. */
export async function allowanceOf(
  owner: Address,
  spender?: Address,
  ctx: ChainContext = chain(),
  budget?: Address,
): Promise<BudgetAllowance | null> {
  const a = await ctx.publicClient.readContract({
    address: required(budget),
    abi: budgetAbi,
    functionName: "allowanceOf",
    args: [owner, spender ?? ctx.payer.account.address],
  });
  if (a.perPeriod === BigInt(0)) return null;
  return {
    perPeriod: a.perPeriod,
    period: BigInt(a.period),
    periodStart: BigInt(a.periodStart),
    spentInPeriod: a.spentInPeriod,
  };
}

/** How much USDC `owner` lets the budget contract move. */
export function usdcAllowanceToBudget(owner: Address, ctx: ChainContext = chain(), budget?: Address): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, required(budget)],
  });
}

export function usdcBalance(owner: Address, ctx: ChainContext = chain()): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}
