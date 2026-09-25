// 1 h reuse of `screens` rows by (kind, subject, chain_id) (DESIGN §9). Only successful calls are
// reused; a failed call is retried next time.

export const CACHE_TTL_MS = 60 * 60 * 1000;

export type ScreenKind = "address" | "token" | "simulation" | "impersonation";

export type ScreenKey = { kind: ScreenKind; subject: string; chainId: number | null };

export type StoredScreen = ScreenKey & {
  id: string;
  mappedFrom: string | null;
  response: unknown;
  status: number;
  latencyMs: number;
  fetchedAt: Date;
};

export type NewScreen = Omit<StoredScreen, "id" | "fetchedAt">;

export interface ScreenRepo {
  // Newest row with status 200 for this key, any age.
  latestOk(key: ScreenKey): Promise<StoredScreen | null>;
  insert(row: NewScreen): Promise<string>;
}

export async function freshScreen(
  repo: ScreenRepo,
  key: ScreenKey,
  now: Date,
): Promise<StoredScreen | null> {
  const row = await repo.latestOk(key);
  if (!row || row.status !== 200) return null;
  return now.getTime() - row.fetchedAt.getTime() < CACHE_TTL_MS ? row : null;
}
