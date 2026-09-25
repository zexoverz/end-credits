// Session approval and deny for a held tip (DESIGN §14.2, "Before E11"). The hold row is locked for
// the whole call, chain tx included, so a second click waits and then sees the hold resolved: one
// release or refund per tip. A chain error rolls everything back and leaves a failed approval row.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { keccak256, toHex, type Hex } from "viem";
import { TxRevertedError } from "../chain/txqueue";
import { db } from "../db/client";
import { approvals, credits, holds } from "../db/schema";
import { msg } from "../messages";
import { formatUsdc } from "../money";
import { lockHold, type HoldRow } from "./hold";
import { appendOwnerReason } from "./reasons";

export interface ApproveChain {
  release(tipId: Hex, approvalRef: Hex): Promise<Hex>;
  refund(tipId: Hex): Promise<Hex>;
}

export type ActionError =
  | { error: "not_found"; status: 404 }
  | { error: "not_pending"; status: 409; holdStatus: string }
  | { error: "expired"; status: 410 }
  | { error: "chain_error"; status: 502; code: string };

export type ApproveResult = { ok: true; releaseTx: Hex; message: string } | ActionError;
export type DenyResult = { ok: true; refundTx: Hex; message: string } | ActionError;

class Abort extends Error {
  constructor(readonly result: ActionError) {
    super(result.error);
  }
}

const chainCode = (e: unknown) => (e instanceof TxRevertedError ? e.errorName : "unknown");

/** Locks the hold and checks it belongs to `ownerId`, is pending and is not expired. */
function checked(row: HoldRow | null, ownerId: string, now: Date): HoldRow {
  if (!row || row.ownerId !== ownerId) throw new Abort({ error: "not_found", status: 404 });
  if (row.status !== "pending") {
    throw new Abort({ error: "not_pending", status: 409, holdStatus: row.status });
  }
  if (row.expiresAt.getTime() <= now.getTime()) throw new Abort({ error: "expired", status: 410 });
  return row;
}

async function unwrap<T>(run: () => Promise<T>): Promise<T | ActionError> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Abort) return e.result;
    throw e;
  }
}

export async function approveWithSession(
  ownerId: string,
  tipId: Hex,
  chain: ApproveChain,
  now: Date = new Date(),
): Promise<ApproveResult> {
  const nonce = toHex(randomBytes(32));
  const failure: { holdId?: string; code?: string } = {};
  const result = await unwrap(() =>
    db().transaction(async (tx) => {
      const row = checked(await lockHold(tx, tipId), ownerId, now);
      let releaseTx: Hex;
      try {
        releaseTx = await chain.release(tipId, keccak256(nonce));
      } catch (e) {
        failure.holdId = row.holdId;
        failure.code = chainCode(e);
        throw new Abort({ error: "chain_error", status: 502, code: failure.code });
      }
      const done = new Date();
      const message = msg("APPROVED_SESSION", {
        amount: formatUsdc(row.amountMicro),
        address: row.payee ?? "",
      });
      await tx.insert(approvals).values({
        holdId: row.holdId,
        ownerId,
        method: "session",
        payload: { tipId, action: "release" },
        nonce,
        startedAt: now,
        status: "approved",
        completedAt: done,
      });
      await tx
        .update(holds)
        .set({ status: "released", releaseTx, resolvedAt: done })
        .where(eq(holds.id, row.holdId));
      await tx
        .update(credits)
        .set({
          outcome: "paid",
          txHash: releaseTx,
          settledAt: done,
          reasons: appendOwnerReason(row.reasons, "APPROVED_SESSION", message),
        })
        .where(eq(credits.id, row.creditId));
      return { ok: true as const, releaseTx, message };
    }),
  );
  if (failure.holdId && failure.code) {
    await recordFailure(ownerId, now, { holdId: failure.holdId, code: failure.code });
  }
  return result;
}

async function recordFailure(
  ownerId: string,
  startedAt: Date,
  f: { holdId: string; code: string },
): Promise<void> {
  await db().insert(approvals).values({
    holdId: f.holdId,
    ownerId,
    method: "session",
    startedAt,
    status: "failed",
    failureCode: f.code,
    completedAt: new Date(),
  });
}

export async function denyHold(
  ownerId: string,
  tipId: Hex,
  chain: ApproveChain,
  now: Date = new Date(),
): Promise<DenyResult> {
  return unwrap(() =>
    db().transaction(async (tx) => {
      const row = checked(await lockHold(tx, tipId), ownerId, now);
      let refundTx: Hex;
      try {
        refundTx = await chain.refund(tipId);
      } catch (e) {
        throw new Abort({ error: "chain_error", status: 502, code: chainCode(e) });
      }
      const done = new Date();
      const message = msg("DENIED", { amount: formatUsdc(row.amountMicro) });
      await tx
        .update(holds)
        .set({ status: "denied", refundTx, resolvedAt: done })
        .where(eq(holds.id, row.holdId));
      await tx
        .update(credits)
        .set({ reasons: appendOwnerReason(row.reasons, "DENIED", message) })
        .where(eq(credits.id, row.creditId));
      return { ok: true as const, refundTx, message };
    }),
  );
}
