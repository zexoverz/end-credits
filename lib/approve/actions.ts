// Session approval and deny for a held tip (DESIGN §14.2, "Before E11"; escrow v2 in decisions.md).
// A release carries the owner's approver signature, stored on a prepared approval row beforehand
// (lib/approve/signed.ts). The hold row is locked for the whole call, chain tx included, so a second
// click waits and then sees the hold resolved: one release or refund per tip. A chain error rolls
// everything back and marks the approval row failed.
import { and, eq } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { TxRevertedError } from "../chain/txqueue";
import { db } from "../db/client";
import { approvals, credits, holds } from "../db/schema";
import { msg } from "../messages";
import { formatUsdc } from "../money";
import { lockHold, type HoldRow } from "./hold";
import { appendOwnerReason } from "./reasons";
import type { ReleaseTypedData } from "./typed-data";

/** A release as the escrow takes it, plus the approver whose ERC-6492 wallet may need deploying. */
export interface ReleaseCall {
  tipId: Hex;
  approvalRef: Hex;
  deadline: bigint;
  signature: Hex;
  approver: Address;
}

export interface ApproveChain {
  release(a: ReleaseCall): Promise<Hex>;
  refund(tipId: Hex): Promise<Hex>;
  /** The EIP-712 domain target: the escrow and its chain. */
  releaseDomain(): { escrow: Address; chainId: number };
  /** EOA, ERC-1271 or ERC-6492 check of the approver's signature over `typedData`. */
  verifyRelease(approver: Address, typedData: ReleaseTypedData, signature: Hex): Promise<boolean>;
}

/** A prepared approval row with a stored signature, ready to release. */
export interface SignedApproval {
  id: string;
  approvalRef: Hex;
  deadline: bigint;
  signature: Hex;
  approver: Address;
}

export type ActionError =
  | { error: "not_found"; status: 404 }
  | { error: "not_pending"; status: 409; holdStatus: string }
  | { error: "expired"; status: 410 }
  | { error: "chain_error"; status: 502; code: string };

export type ApproveResult = { ok: true; releaseTx: Hex; message: string } | ActionError;
export type DenyResult = { ok: true; refundTx: Hex; message: string } | ActionError;

export class Abort extends Error {
  constructor(readonly result: ActionError) {
    super(result.error);
  }
}

export const chainCode = (e: unknown) => (e instanceof TxRevertedError ? e.errorName : "unknown");

/** Locks the hold and checks it belongs to `ownerId`, is pending and is not expired. */
export function checked(row: HoldRow | null, ownerId: string, now: Date): HoldRow {
  if (!row || row.ownerId !== ownerId) throw new Abort({ error: "not_found", status: 404 });
  if (row.status !== "pending") {
    throw new Abort({ error: "not_pending", status: 409, holdStatus: row.status });
  }
  if (row.expiresAt.getTime() <= now.getTime()) throw new Abort({ error: "expired", status: 410 });
  return row;
}

export async function unwrap<T>(run: () => Promise<T>): Promise<T | ActionError> {
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
  approval: SignedApproval,
  chain: ApproveChain,
  now: Date = new Date(),
): Promise<ApproveResult> {
  const failure: { code?: string } = {};
  const result = await unwrap(() =>
    db().transaction(async (tx) => {
      const row = checked(await lockHold(tx, tipId), ownerId, now);
      let releaseTx: Hex;
      try {
        releaseTx = await chain.release(releaseCall(tipId, approval));
      } catch (e) {
        failure.code = chainCode(e);
        throw new Abort({ error: "chain_error", status: 502, code: failure.code });
      }
      const done = new Date();
      const message = await markReleased(tx, row, releaseTx, "APPROVED_SESSION", done);
      await tx
        .update(approvals)
        .set({ status: "approved", completedAt: done })
        .where(eq(approvals.id, approval.id));
      return { ok: true as const, releaseTx, message };
    }),
  );
  if (failure.code) await markApprovalFailed(approval.id, failure.code);
  return result;
}

export const releaseCall = (tipId: Hex, a: SignedApproval): ReleaseCall => ({
  tipId,
  approvalRef: a.approvalRef,
  deadline: a.deadline,
  signature: a.signature,
  approver: a.approver,
});

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/**
 * The one release outcome for both approval methods: hold released, credit held → paid with the
 * release tx, and the owner's reason (`APPROVED` or `APPROVED_SESSION`) appended. Returns its text.
 */
export async function markReleased(
  tx: Tx,
  row: HoldRow,
  releaseTx: Hex,
  code: "APPROVED" | "APPROVED_SESSION",
  done: Date,
): Promise<string> {
  const message = msg(code, { amount: formatUsdc(row.amountMicro), address: row.payee ?? "" });
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
      reasons: appendOwnerReason(row.reasons, code, message),
    })
    .where(eq(credits.id, row.creditId));
  return message;
}

/** A pending approval that ended without a release. */
export async function markApprovalFailed(id: string, code: string): Promise<void> {
  await db()
    .update(approvals)
    .set({ status: "failed", failureCode: code, completedAt: new Date() })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")));
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
