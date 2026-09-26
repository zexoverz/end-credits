// Money back to the owner's own wallet (decisions.md "Refunds go back to the owner's wallet"). With a
// budget wallet the hot key pulls a session's spend first, so a refunded tip (deny, expiry) and any
// pulled share that did not move land on the hot key; these send them back, exactly, once.
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { formatUnits, type Address, type Hash } from "viem";
import type { db } from "../db/client";
import { credits, holds, owners, sessions } from "../db/schema";
import { msg, type MessageCode } from "../messages";
import { errorLabel } from "./settle";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type Db = ReturnType<typeof db> | Tx;

export type ReturnFn = (owner: Address, amount: bigint) => Promise<Hash>;
export type ReturnDeps = { returnToOwner: ReturnFn; log?: (line: string) => void };

/** The owner's wallet and the tip's amount when the hold was refunded, funded by a pull and not
 *  returned yet; null otherwise. */
async function holdTarget(d: Db, holdId: string) {
  const [row] = await d
    .select({ owner: owners.budgetOwner, amount: credits.amountMicro, creditId: credits.id, reasons: credits.reasons })
    .from(holds)
    .innerJoin(credits, eq(credits.id, holds.creditId))
    .innerJoin(sessions, eq(sessions.id, credits.sessionId))
    .innerJoin(owners, eq(owners.id, sessions.ownerId))
    .where(
      and(
        eq(holds.id, holdId),
        isNotNull(holds.refundTx),
        isNull(holds.returnTx),
        isNotNull(sessions.budgetPullTx),
        isNotNull(owners.budgetOwner),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function appendPolicy(d: Db, creditId: string, code: MessageCode, text: string) {
  await d
    .update(credits)
    .set({ reasons: sql`${credits.reasons} || ${JSON.stringify([{ source: "policy", code, text }])}::jsonb` })
    .where(eq(credits.id, creditId));
}

const hasCode = (raw: unknown, code: string) =>
  Array.isArray(raw) && raw.some((r) => (r as { code?: string })?.code === code);

/**
 * After a refund: send the tip back to the owner's wallet when its session was funded by a pull.
 * Success stores `holds.return_tx` and says RETURNED; a failure is logged and says RETURN_PENDING
 * (once), and the expirer retries. Never throws; the refund stays recorded either way.
 */
export async function returnHold(d: Db, holdId: string, deps: ReturnDeps): Promise<Hash | null> {
  const t = await holdTarget(d, holdId);
  if (!t) return null;
  let tx: Hash;
  try {
    tx = await deps.returnToOwner(t.owner as Address, t.amount);
  } catch (err) {
    deps.log?.(`return: hold ${holdId} not returned: ${errorLabel(err)}`);
    if (!hasCode(t.reasons, "RETURN_PENDING")) {
      await appendPolicy(d, t.creditId, "RETURN_PENDING", msg("RETURN_PENDING"));
    }
    return null;
  }
  await d.update(holds).set({ returnTx: tx }).where(eq(holds.id, holdId));
  await appendPolicy(d, t.creditId, "RETURNED", msg("RETURNED", { amount: formatUnits(t.amount, 6) }));
  return tx;
}

/** Refunded holds of funded sessions whose return has not gone through. */
export async function pendingHoldReturns(d: Db): Promise<string[]> {
  const rows = await d
    .select({ id: holds.id })
    .from(holds)
    .innerJoin(credits, eq(credits.id, holds.creditId))
    .innerJoin(sessions, eq(sessions.id, credits.sessionId))
    .innerJoin(owners, eq(owners.id, sessions.ownerId))
    .where(and(isNotNull(holds.refundTx), isNull(holds.returnTx), isNotNull(sessions.budgetPullTx), isNotNull(owners.budgetOwner)));
  return rows.map((r) => r.id);
}

/** Settled, funded sessions with a leftover not yet returned. */
export async function pendingSessionReturns(d: Db): Promise<string[]> {
  const rows = await d
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(owners, eq(owners.id, sessions.ownerId))
    .where(
      and(
        eq(sessions.status, "settled"),
        isNotNull(sessions.budgetPullTx),
        isNull(sessions.returnTx),
        gt(sessions.leftoverMicro, BigInt(0)),
        isNotNull(owners.budgetOwner),
      ),
    );
  return rows.map((r) => r.id);
}

/** Retry one session's leftover return, the session row locked so two workers never both send. */
export async function returnSessionLeftover(d: ReturnType<typeof db>, sessionId: string, deps: ReturnDeps): Promise<Hash | null> {
  return d.transaction(async (tx) => {
    const [row] = await tx
      .select({ owner: owners.budgetOwner, leftover: sessions.leftoverMicro, returnTx: sessions.returnTx })
      .from(sessions)
      .innerJoin(owners, eq(owners.id, sessions.ownerId))
      .where(eq(sessions.id, sessionId))
      .for("update", { of: sessions, skipLocked: true });
    if (!row || row.returnTx || !row.owner || !row.leftover || row.leftover <= BigInt(0)) return null;
    try {
      const hash = await deps.returnToOwner(row.owner as Address, row.leftover);
      await tx.update(sessions).set({ returnTx: hash }).where(eq(sessions.id, sessionId));
      return hash;
    } catch (err) {
      deps.log?.(`return: session ${sessionId} leftover not returned: ${errorLabel(err)}`);
      return null;
    }
  });
}

/** Retry one hold's return with the hold row locked (a deny in flight holds the same lock). */
export async function retryHoldReturn(d: ReturnType<typeof db>, holdId: string, deps: ReturnDeps): Promise<Hash | null> {
  return d.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: holds.id })
      .from(holds)
      .where(eq(holds.id, holdId))
      .for("update", { skipLocked: true });
    return locked ? returnHold(tx, holdId, deps) : null;
  });
}
