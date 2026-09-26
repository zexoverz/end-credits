// Postgres access for settlement (DESIGN §7). The orchestration in settle.ts calls only these.
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { Hex } from "viem";
import { db } from "../db/client";
import { credits, holds, owners, packages, payeeObservations, sessions, usage } from "../db/schema";
import type { KnownPayee } from "../decision/lookalike";
import type { Address, Reason } from "../decision/types";
import { packageKey } from "../payee/keys";
import type { NpmPackageWithDownloads } from "../registry/npm";

export type Database = ReturnType<typeof db>;

// Outcomes that spend the owner's daily limit.
export const SPENDING = ["paid", "capped", "held", "reserved"] as const;

/** Claims one session asking to settle and marks it `settling`; null when none is waiting. */
export async function claimNextSession(database: Database): Promise<string | null> {
  const rows = await database.execute<{ id: string }>(sql`
    update ${sessions} set status = 'settling'
    where id = (
      select id from ${sessions}
      where status = 'uploaded' and settle_requested_at is not null
      order by settle_requested_at
      for update skip locked
      limit 1
    )
    returning id`);
  return rows[0]?.id ?? null;
}

export async function loadSettleContext(database: Database, sessionId: string) {
  const [row] = await database
    .select({ session: sessions, owner: owners })
    .from(sessions)
    .innerJoin(owners, eq(owners.id, sessions.ownerId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) throw new Error(`session ${sessionId} not found`);
  const rows = await database
    .select({ packageName: usage.packageName, version: usage.version, signal: usage.signal, count: usage.count })
    .from(usage)
    .where(eq(usage.sessionId, sessionId));
  return { ...row, usage: rows };
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Sum of today's (UTC) spending credits across the owner's sessions, in micro-USDC. */
export async function spentToday(database: Database, ownerId: string, now: Date): Promise<bigint> {
  const [row] = await database
    .select({ total: sql<string | null>`sum(${credits.amountMicro})` })
    .from(credits)
    .innerJoin(sessions, eq(sessions.id, credits.sessionId))
    .where(
      and(
        eq(sessions.ownerId, ownerId),
        inArray(credits.outcome, [...SPENDING]),
        gte(credits.decidedAt, startOfUtcDay(now)),
      ),
    );
  return BigInt(row?.total ?? 0);
}

/** packages rows for these names (created on first sight), name → id. */
export async function ensurePackages(database: Database, names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  await database
    .insert(packages)
    .values(names.map((name) => ({ name, packageKey: packageKey(name) })))
    .onConflictDoNothing();
  const rows = await database
    .select({ id: packages.id, name: packages.name })
    .from(packages)
    .where(and(eq(packages.ecosystem, "npm"), inArray(packages.name, names)));
  return new Map(rows.map((r) => [r.name, r.id]));
}

export async function saveRegistry(database: Database, packageId: string, pkg: NpmPackageWithDownloads, now: Date) {
  await database
    .update(packages)
    .set({
      repoFullName: pkg.repoFullName,
      repoDirectory: pkg.repoDirectory,
      homepage: pkg.homepage,
      weeklyDownloads: pkg.weeklyDownloads,
      firstPublishedAt: pkg.createdAt,
      fundingLinks: pkg.fundingLinks,
      repoSource: pkg.repoSource ?? "registry",
      fetchedAt: now,
    })
    .where(eq(packages.id, packageId));
}

/** The repo an uploader declared for this package (set at ingest), or null. */
export async function declaredRepo(
  database: Database,
  packageId: string,
): Promise<{ repoFullName: string; repoDirectory: string | null; homepage: string | null } | null> {
  const [row] = await database
    .select({ repo: packages.declaredRepo, dir: packages.declaredDirectory, homepage: packages.declaredHomepage })
    .from(packages)
    .where(eq(packages.id, packageId));
  return row?.repo ? { repoFullName: row.repo, repoDirectory: row.dir, homepage: row.homepage } : null;
}

export type NewCredit = typeof credits.$inferInsert;

export async function insertCredits(database: Database, rows: NewCredit[]): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  const inserted = await database
    .insert(credits)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: credits.id, packageId: credits.packageId });
  return new Map(inserted.map((r) => [r.packageId, r.id]));
}

export async function setPayee(database: Database, creditId: string, payee: string | null, source: string | null) {
  await database.update(credits).set({ payee, payeeSource: source }).where(eq(credits.id, creditId));
}

/** The decision, stored before anything is signed or sent (AGENTS rule 6). */
export async function recordDecision(
  database: Database,
  creditId: string,
  d: { outcome: string; reasons: Reason[]; screenIds: string[] },
  now: Date,
) {
  await database
    .update(credits)
    .set({ outcome: d.outcome, reasons: d.reasons, screenIds: d.screenIds, decidedAt: now })
    .where(eq(credits.id, creditId));
}

export async function recordExecution(
  database: Database,
  creditId: string,
  e: { txHash: string; receipt?: unknown },
  now: Date,
) {
  await database
    .update(credits)
    .set({ txHash: e.txHash, ...(e.receipt ? { receipt: e.receipt } : {}), settledAt: now })
    .where(eq(credits.id, creditId));
}

export async function appendReason(database: Database, creditId: string, reason: Reason) {
  await database
    .update(credits)
    .set({ reasons: sql`${credits.reasons} || ${JSON.stringify([reason])}::jsonb` })
    .where(eq(credits.id, creditId));
}

export async function insertHold(
  database: Database,
  h: { creditId: string; tipId: Hex; expiresAt: Date; holdTx: string },
) {
  await database.insert(holds).values(h);
}

/** True only when a paid or capped decision is stored for the credit (x402 client gate). */
export async function decisionAllowsPay(database: Database, creditId: string): Promise<boolean> {
  const [row] = await database
    .select({ outcome: credits.outcome, decidedAt: credits.decidedAt })
    .from(credits)
    .where(eq(credits.id, creditId))
    .limit(1);
  return !!row?.decidedAt && (row.outcome === "paid" || row.outcome === "capped");
}

export async function creditTx(database: Database, creditId: string): Promise<string | null> {
  const [row] = await database.select({ tx: credits.txHash }).from(credits).where(eq(credits.id, creditId));
  return row?.tx ?? null;
}

/** Every payee observed for a package other than this one (claims included), for the lookalike rule. */
export async function knownPayees(database: Database, exceptPackageId: string): Promise<KnownPayee[]> {
  const rows = await database
    .selectDistinct({ address: payeeObservations.address, pkg: packages.name })
    .from(payeeObservations)
    .innerJoin(packages, eq(packages.id, payeeObservations.packageId))
    .where(ne(payeeObservations.packageId, exceptPackageId));
  return rows.map((r) => ({ address: r.address as Address, pkg: r.pkg }));
}

export async function finishSession(
  database: Database,
  sessionId: string,
  s: { budgetMicro: bigint; manifestHash: string | null; recordTx: string | null },
) {
  await database
    .update(sessions)
    .set({ status: "settled", budgetMicro: s.budgetMicro, manifestHash: s.manifestHash, recordTx: s.recordTx })
    .where(eq(sessions.id, sessionId));
}

export async function failSession(database: Database, sessionId: string) {
  await database
    .update(sessions)
    .set({ status: "failed" })
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, "settling")));
}
