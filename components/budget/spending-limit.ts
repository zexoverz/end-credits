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
