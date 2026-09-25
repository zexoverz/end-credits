// Change detection (SPEC §6.3). Only our own observation times count; commit dates never do.
import type { ObservationStore } from "./observe";

export const CHANGE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export type Change = { changed: boolean; days: number };

const NOT_CHANGED: Change = { changed: false, days: 0 };

export async function recentlyChanged(
  store: ObservationStore,
  packageId: string,
  address: string,
  opts: { now?: Date } = {},
): Promise<Change> {
  const now = (opts.now ?? new Date()).getTime();
  const windowStart = now - CHANGE_WINDOW_DAYS * DAY_MS;
  const current = address.toLowerCase();
  const rows = await store.forPackage(packageId);

  const others = rows.filter(
    (r) => r.address.toLowerCase() !== current && r.observedAt.getTime() > windowStart,
  );
  if (others.length === 0) return NOT_CHANGED;

  const lastOther = Math.max(...others.map((r) => r.observedAt.getTime()));
  const sinceChange = rows
    .filter((r) => r.address.toLowerCase() === current && r.observedAt.getTime() > lastOther)
    .map((r) => r.observedAt.getTime());
  const changedAt = sinceChange.length ? Math.min(...sinceChange) : now;
  return { changed: true, days: Math.floor((now - changedAt) / DAY_MS) };
}
