// x402 v2 constants (docs/plan/decisions.md, CONFIRM: x402 v2).
export const X402_VERSION = 2;
export const NETWORK = "eip155:84532" as const;
export const SCHEME = "exact";
export const MAX_TIMEOUT_SECONDS = 120;
// EIP-712 domain of Base Sepolia USDC; the exact scheme signs over it.
export const USDC_EXTRA = { name: "USDC", version: "2" } as const;
export const SCREEN_MAX_AGE_MS = 10 * 60 * 1000;
export const PAYABLE_OUTCOMES: readonly string[] = ["paid", "capped"];
export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
