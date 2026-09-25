// Reuse of `screens` rows by (kind, subject, chain_id) (DESIGN §9). Only successful calls are
// reused; a failed call is retried next time. Token screens live 1 h; address screens only 5 min,
// because the x402 route refuses to pay on an address screen older than 10 min.

export const CACHE_TTL_MS = 60 * 60 * 1000;
export const ADDRESS_TTL_MS = 5 * 60 * 1000;

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
  const ttl = key.kind === "address" ? ADDRESS_TTL_MS : CACHE_TTL_MS;
  return now.getTime() - row.fetchedAt.getTime() < ttl ? row : null;
}
