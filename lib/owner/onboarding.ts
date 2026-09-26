// The owner's setup checklist (`GET /api/owner/onboarding`): each step read from the DB or the chain,
// in the order the UI renders them, and `next` = the first step not done.
import { and, desc, eq, isNull } from "drizzle-orm";
import { zeroAddress, type Address } from "viem";
import { allowanceOf, remaining, usdcAllowanceToBudget } from "../chain/budget";
import { chain } from "../chain/keys";
import { db } from "../db/client";
import { agentKeys, sessions } from "../db/schema";
import { formatUsdc } from "../money";
import { ownerRow } from "./settings";

export const STEP_IDS = [
  "signed_in",
  "wallet_bound",
  "budget_set",
  "approver_set",
  "spend_allowance",
  "agent_key",
  "first_session",
] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface Step {
  id: StepId;
  done: boolean;
  detail: string | null;
  href: string | null;
}

export interface Onboarding {
  steps: Step[];
  next: StepId | null;
}

export interface OnboardingDeps {
  /** The escrow approver in force for `payer` (zero address when none). */
  approverOf(payer: Address): Promise<Address>;
  /** The budget wallet's allowance for the owner's payer key (EndCreditsBudget); null when none is set. */
  readSpendAllowance?(wallet: Address | null, payer: Address): Promise<SpendAllowance | null>;
}

/** Micro-USDC, and the period in seconds. */
export interface SpendAllowance {
  perPeriod: bigint;
  period: bigint;
  /** What the hot key can still pull this period. */
  remaining: bigint;
  /** USDC the wallet has approved to the budget contract. */
  approved: bigint;
}

/** EndCreditsBudget on Base Sepolia: `wallet`'s allowance for the owner's payer key. */
export const readSpendAllowance: NonNullable<OnboardingDeps["readSpendAllowance"]> = async (wallet, spender) => {
  if (!wallet) return null;
  const ctx = chain();
  const [a, left, approved] = await Promise.all([
    allowanceOf(wallet, spender, ctx),
    remaining(wallet, spender, ctx),
    usdcAllowanceToBudget(wallet, ctx),
  ]);
  return a && { perPeriod: a.perPeriod, period: a.period, remaining: left, approved };
};

const PERIOD_NAMES: Record<string, string> = { "3600": "hour", "86400": "day", "604800": "week" };

const perPeriodLabel = (seconds: bigint) =>
  PERIOD_NAMES[seconds.toString()] ?? `${Number(seconds) / 3600} hours`;

const OWNER_PAGE = "/app/owner";

async function approverStep(payer: Address, deps: OnboardingDeps): Promise<Step> {
  const step = { id: "approver_set" as const, href: `${OWNER_PAGE}#approver` };
  try {
    const approver = await deps.approverOf(payer);
    const set = approver !== zeroAddress;
    return { ...step, done: set, detail: set ? approver : null };
  } catch {
    return { ...step, done: false, detail: "chain unavailable" };
  }
}

// Done when the hot key can pull now and the USDC approval covers a full period.
async function allowanceStep(wallet: Address | null, payer: Address, deps: OnboardingDeps): Promise<Step> {
  const step = { id: "spend_allowance" as const, href: `${OWNER_PAGE}#allowance` };
  if (!process.env.BUDGET_ADDRESS) return { ...step, done: false, detail: "coming soon" };
  const read = deps.readSpendAllowance ?? readSpendAllowance;
  const allowance = await read(wallet, payer).catch(() => null);
  if (allowance === null) return { ...step, done: false, detail: null };
  const covered = allowance.approved >= allowance.perPeriod;
  const detail =
    `${formatUsdc(allowance.perPeriod)} USDC per ${perPeriodLabel(allowance.period)}, ` +
    `${formatUsdc(allowance.remaining)} left` +
    (covered ? "" : `, only ${formatUsdc(allowance.approved)} USDC approved`);
  return { ...step, done: allowance.remaining > BigInt(0) && covered, detail };
}

export async function ownerOnboarding(ownerId: string, deps: OnboardingDeps): Promise<Onboarding | null> {
  const row = await ownerRow(ownerId);
  if (!row) return null;
  const wallet = (row.walletAddress as Address | null) ?? null;
  // The funding wallet the budget pulls from; the sign-in wallet until one is named.
  const funder = ((row.budgetOwner ?? row.walletAddress) as Address | null) ?? null;
  const [key] = await db()
    .select({ id: agentKeys.id })
    .from(agentKeys)
    .where(and(eq(agentKeys.ownerId, ownerId), isNull(agentKeys.revokedAt)))
    .limit(1);
  const [session] = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.ownerId, ownerId))
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  const budget =
    `${formatUsdc(row.sessionBudgetMicro)} USDC per session, ` +
    `${formatUsdc(row.packageCapMicro)} per package, ${formatUsdc(row.dailyLimitMicro)} per day`;

  const steps: Step[] = [
    { id: "signed_in", done: true, detail: null, href: null },
    { id: "wallet_bound", done: wallet !== null, detail: wallet, href: null },
    { id: "budget_set", done: true, detail: budget, href: `${OWNER_PAGE}#budget` },
    await approverStep(row.payerAddress as Address, deps),
    await allowanceStep(funder, row.payerAddress as Address, deps),
    { id: "agent_key", done: Boolean(key), detail: null, href: `${OWNER_PAGE}#keys` },
    {
      id: "first_session",
      done: Boolean(session),
      detail: null,
      href: session ? `/app/credits/${session.id}` : null,
    },
  ];
  return { steps, next: steps.find((s) => !s.done)?.id ?? null };
}
