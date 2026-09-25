// USDC as decimal strings at the API edge, micro-USDC bigints everywhere else (decisions.md, E0).
import { formatUnits, parseUnits } from "viem";

export const USDC_DECIMALS = 6;

/** 150000n → "0.15" */
export const formatUsdc = (micro: bigint): string => formatUnits(micro, USDC_DECIMALS);

/** A plain decimal with at most 6 places, no sign, no exponent. */
export const USDC_PATTERN = /^\d{1,9}(\.\d{1,6})?$/;

/** "0.15" → 150000n. Throws on anything USDC_PATTERN rejects. */
export function parseUsdc(value: string): bigint {
  if (!USDC_PATTERN.test(value)) throw new Error("invalid USDC amount");
  return parseUnits(value, USDC_DECIMALS);
}

export const basescanTx = (hash: string | null): string | null =>
  hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? `https://sepolia.basescan.org/tx/${hash}` : null;
