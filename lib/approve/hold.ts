// One hold with what the approve page and actions need, found by its tip id.
import { eq } from "drizzle-orm";
import type { Hex } from "viem";
import type { db } from "../db/client";
import { credits, holds, packages, sessions } from "../db/schema";

export const TIP_ID = /^0x[0-9a-fA-F]{64}$/;

export const isTipId = (s: string): s is Hex => TIP_ID.test(s);

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type Db = ReturnType<typeof db> | Tx;

const columns = {
  holdId: holds.id,
  tipId: holds.tipId,
  status: holds.status,
  expiresAt: holds.expiresAt,
  releaseTx: holds.releaseTx,
  refundTx: holds.refundTx,
  creditId: credits.id,
  amountMicro: credits.amountMicro,
  payee: credits.payee,
  reasons: credits.reasons,
  ownerId: sessions.ownerId,
  sessionId: sessions.id,
  packageName: packages.name,
};

function query(d: Db, tipId: Hex) {
  return d
    .select(columns)
    .from(holds)
    .innerJoin(credits, eq(credits.id, holds.creditId))
    .innerJoin(sessions, eq(sessions.id, credits.sessionId))
    .innerJoin(packages, eq(packages.id, credits.packageId))
    .where(eq(holds.tipId, tipId.toLowerCase()))
    .limit(1);
}

export type HoldRow = Awaited<ReturnType<typeof query>>[number];

export async function findHold(d: Db, tipId: Hex): Promise<HoldRow | null> {
  const [row] = await query(d, tipId);
  return row ?? null;
}

/** Same row, locked (`FOR UPDATE OF holds`) until the transaction ends. */
export async function lockHold(tx: Tx, tipId: Hex): Promise<HoldRow | null> {
  const [row] = await query(tx, tipId).for("update", { of: holds });
  return row ?? null;
}
