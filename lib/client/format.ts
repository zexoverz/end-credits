// Formatting helpers shared by client pages.
export const BASESCAN = "https://sepolia.basescan.org";

export const txUrl = (tx: string) => `${BASESCAN}/tx/${tx}`;
export const addressUrl = (a: string) => `${BASESCAN}/address/${a}`;

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function usdc(v: string | null | undefined): string {
  return v == null ? "—" : `${v} USDC`;
}
