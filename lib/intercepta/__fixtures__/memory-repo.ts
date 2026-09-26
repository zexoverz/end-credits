// Test-only in-memory `screens` table. Never imported by product code.
import type { NewScreen, ScreenKey, ScreenRepo, StoredScreen } from "../cache";

export function memoryRepo(now: () => Date = () => new Date()) {
  const rows: StoredScreen[] = [];
  const repo: ScreenRepo = {
    async latestOk(key: ScreenKey) {
      const hits = rows.filter(
        (r) =>
          (r.status === 200 || r.status === 404) &&
          r.kind === key.kind &&
          r.subject === key.subject &&
          r.chainId === key.chainId,
      );
      return hits.sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())[0] ?? null;
    },
    async insert(row: NewScreen) {
      const id = `screen-${rows.length + 1}`;
      rows.push({ ...row, id, fetchedAt: now() });
      return id;
    },
  };
  return { repo, rows };
}
