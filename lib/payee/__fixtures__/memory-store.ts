// Test-only in-memory ObservationStore.
import type { Observation, ObservationStore } from "../observe";

export function memoryStore(
  seed: Observation[] = [],
  now: () => Date = () => new Date(),
): ObservationStore & { rows: Observation[] } {
  const rows = [...seed];
  return {
    rows,
    async record(o) {
      rows.push({ ...o, observedAt: now() });
    },
    async forPackage(packageId) {
      return rows
        .filter((r) => r.packageId === packageId)
        .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    },
  };
}
