import { parseUsdc, USDC_PATTERN } from "@/lib/money";
import { BUDGET_COPY as C } from "@/lib/copy/budget";

export function spendingAmount(value: string): bigint {
  if (!USDC_PATTERN.test(value)) throw new Error(C.BAD_AMOUNT);
  const amount = parseUsdc(value);
  if (amount <= 0n) throw new Error(C.BAD_AMOUNT);
  return amount;
}

export function approvalCovers(
  approved: string | null,
  value: string,
): boolean {
  if (approved === null || !USDC_PATTERN.test(approved)) return false;
  try {
    return parseUsdc(approved) >= spendingAmount(value);
  } catch {
    return false;
  }
}

export function spendingArguments(
  value: string,
  period: number,
  approved: string | null,
) {
  const amount = spendingAmount(value);
  if (!Number.isInteger(period) || period < 3600 || period > 30 * 86400) {
    throw new Error(C.BAD_PERIOD);
  }
  if (!approvalCovers(approved, value)) throw new Error(C.APPROVAL_REQUIRED);
  return { amount, period: BigInt(period) };
}

export type LimitStatus = "none" | "active" | "used_up" | "change";

/**
 * Where the chosen amount and period stand against the limit on chain: `active` when that exact
 * limit is set and has room left, `used_up` when it is set but this window is spent, `change` when
 * the selection differs from what is set, `none` when no limit is set.
 */
export function limitStatus(
  onchain: { perPeriod: string; period: number; remaining: string } | null | undefined,
  value: string,
  period: number,
): LimitStatus {
  if (!onchain) return "none";
  let same = false;
  try {
    same = parseUsdc(onchain.perPeriod) === spendingAmount(value) && onchain.period === period;
  } catch {
    same = false;
  }
  if (!same) return "change";
  return USDC_PATTERN.test(onchain.remaining) && parseUsdc(onchain.remaining) > 0n ? "active" : "used_up";
}
