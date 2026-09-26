// Change detection (SPEC §6.3). Our own observation times count, and (T2.6) GitHub's server-set
// push time for a funding file we have not watched for the whole window. Commit dates never do.
import type { ObservationStore } from "./observe";

export const CHANGE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export type Change = { changed: boolean; days: number };

const NOT_CHANGED: Change = { changed: false, days: 0 };

export async function recentlyChanged(
  store: ObservationStore,
  packageId: string,
  address: string,
  opts: { now?: Date; pushedAt?: () => Promise<Date | null>; repoCreatedAt?: () => Promise<Date | null> } = {},
): Promise<Change> {
  const now = (opts.now ?? new Date()).getTime();
  const windowStart = now - CHANGE_WINDOW_DAYS * DAY_MS;
  const daysSince = (t: number) => Math.floor((now - t) / DAY_MS);
  const current = address.toLowerCase();
  const rows = await store.forPackage(packageId);

  const others = rows.filter(
    (r) => r.address.toLowerCase() !== current && r.observedAt.getTime() > windowStart,
  );
  if (others.length > 0) {
    const lastOther = Math.max(...others.map((r) => r.observedAt.getTime()));
    const sinceChange = rows
      .filter((r) => r.address.toLowerCase() === current && r.observedAt.getTime() > lastOther)
      .map((r) => r.observedAt.getTime());
    return { changed: true, days: daysSince(sinceChange.length ? Math.min(...sinceChange) : now) };
  }

  // Our history does not reach back over the whole window: ask when the file was pushed.
  const firstObserved = Math.min(...rows.map((r) => r.observedAt.getTime()), now);
  if (opts.pushedAt && firstObserved > windowStart) {
    const pushed = await opts.pushedAt();
    if (pushed && pushed.getTime() > windowStart) {
      // A payout file that appears on an established project is what a takeover looks like. A
      // project that is itself new lists funding from its first days; that is a first listing,
      // screened like any payee. An unknown age stays conservative (a change).
      const created = opts.repoCreatedAt ? await opts.repoCreatedAt() : null;
      if (created && created.getTime() > windowStart) return NOT_CHANGED;
      return { changed: true, days: daysSince(pushed.getTime()) };
    }
  }
  return NOT_CHANGED;
}
