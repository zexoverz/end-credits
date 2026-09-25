// Our own address-poisoning rule, not Intercepta's (DESIGN §8): a payee whose first 4 and last 4
// hex digits after 0x match another known payee, but which is a different address.
import type { Address } from "./types";

export type KnownPayee = { address: Address; pkg: string };

export function findLookalike(payee: Address, known: KnownPayee[]): { of: Address; pkg: string } | null {
  const p = payee.toLowerCase();
  for (const k of known) {
    const a = k.address.toLowerCase();
    if (a === p) continue;
    if (a.slice(2, 6) === p.slice(2, 6) && a.slice(-4) === p.slice(-4)) return { of: k.address, pkg: k.pkg };
  }
  return null;
}
