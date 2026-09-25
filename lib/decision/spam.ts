// Spam pattern (DESIGN §8, P1): within one session, the packages paying this payee that are either
// under 1,000 weekly downloads or first published in the last 30 days. Deliberately narrow: real
// maintainers share one wallet across many popular packages. Unknown download counts are not
// treated as low.
import type { Address } from "./types";

export const LOW_DOWNLOADS = 1000;
export const NEW_PACKAGE_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionPackage = {
  name: string;
  payee: Address | null;
  weeklyDownloads: number | null;
  firstPublishedAt: Date | null;
};

export function spamCount(payee: Address, session: SessionPackage[], now: Date): { count: number } | null {
  const p = payee.toLowerCase();
  const count = session.filter((s) => s.payee?.toLowerCase() === p && isLowOrNew(s, now)).length;
  return count > 0 ? { count } : null;
}

function isLowOrNew(s: SessionPackage, now: Date): boolean {
  const low = s.weeklyDownloads !== null && s.weeklyDownloads < LOW_DOWNLOADS;
  const fresh = s.firstPublishedAt !== null && s.firstPublishedAt.getTime() > now.getTime() - NEW_PACKAGE_MS;
  return low || fresh;
}
