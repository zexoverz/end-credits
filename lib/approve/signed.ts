// Escrow v2 approval steps before any release (decisions.md "Escrow v2 app integration"):
// prepare → the owner's approver wallet signs → the signature is checked and stored → start.
// The typed data is always rebuilt from our rows, never taken from the client.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { approveWithWorld } from "../world/stepup";
import { db } from "../db/client";
import { approvals, holds, owners } from "../db/schema";
import { Abort, checked, unwrap, type ActionError, type ApproveChain, type SignedApproval } from "./actions";
import { findHold, type HoldRow } from "./hold";
import { approvalRefFor, releaseTypedData, releaseTypedDataJson, type ReleaseMessage } from "./typed-data";

export type NoApprover = { error: "no_approver"; status: 409 };
export type BadSignature = { error: "bad_signature"; status: 400 };
export type NoSignature = { error: "no_signature"; status: 409 };

export interface Prepared {
  ok: true;
  approvalId: string;
  approver: Address;
  typedData: ReturnType<typeof releaseTypedDataJson>;
}

async function approverOfOwner(ownerId: string): Promise<Address | null> {
  const [o] = await db()
    .select({ approver: owners.approverAddress })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  return (o?.approver as Address | null) ?? null;
}

const deadlineOf = (expiresAt: Date) => BigInt(Math.floor(expiresAt.getTime() / 1000));

function messageFor(row: HoldRow, approvalRef: Hex, deadline: bigint): ReleaseMessage {
  if (!row.payee) throw new Abort({ error: "not_found", status: 404 });
  return {
    tipId: row.tipId as Hex,
    payee: row.payee as Address,
    amount: row.amountMicro,
    approvalRef,
    deadline,
  };
}

/** Writes a pending approval with its approvalRef and deadline; returns what the wallet signs. */
export async function prepareApproval(
  ownerId: string,
  tipId: Hex,
  chain: ApproveChain,
  now: Date = new Date(),
): Promise<Prepared | ActionError | NoApprover> {
  const approver = await approverOfOwner(ownerId);
  return unwrap(async () => {
    const row = checked(await findHold(db(), tipId), ownerId, now);
    if (!approver) return { error: "no_approver" as const, status: 409 as const };
    const approvalId = randomUUID();
    const deadline = deadlineOf(row.expiresAt);
    const m = messageFor(row, approvalRefFor(row.tipId as Hex, approvalId), deadline);
    await db()
      .insert(approvals)
      .values({
        id: approvalId,
        holdId: row.holdId,
        ownerId,
        method: approveWithWorld() ? "world" : "session",
        payload: { tipId: row.tipId, action: "release" },
        startedAt: now,
        status: "pending",
        approvalRef: m.approvalRef,
        releaseDeadline: deadline,
      });
    const { escrow, chainId } = chain.releaseDomain();
    return { ok: true as const, approvalId, approver, typedData: releaseTypedDataJson(m, escrow, chainId) };
  });
}

interface PendingApproval {
  id: string;
  method: string;
  approvalRef: string | null;
  releaseDeadline: bigint | null;
  releaseSignature: string | null;
}

/** The owner's pending approval `approvalId` for this tip, or null. */
async function pendingApproval(ownerId: string, tipId: Hex, approvalId: string): Promise<PendingApproval | null> {
  const [a] = await db()
    .select({
      id: approvals.id,
      method: approvals.method,
      approvalRef: approvals.approvalRef,
      releaseDeadline: approvals.releaseDeadline,
      releaseSignature: approvals.releaseSignature,
    })
    .from(approvals)
    .innerJoin(holds, eq(holds.id, approvals.holdId))
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.ownerId, ownerId),
        eq(approvals.status, "pending"),
        eq(holds.tipId, tipId.toLowerCase()),
      ),
    )
    .limit(1);
  return a ?? null;
}

const notFound = { error: "not_found" as const, status: 404 as const };

/** Checks the approver's signature over the typed data rebuilt from our rows, then stores it. */
export async function storeSignature(
  ownerId: string,
  tipId: Hex,
  approvalId: string,
  signature: Hex,
  chain: ApproveChain,
  now: Date = new Date(),
): Promise<{ ok: true } | ActionError | NoApprover | BadSignature> {
  const approver = await approverOfOwner(ownerId);
  return unwrap(async () => {
    const row = checked(await findHold(db(), tipId), ownerId, now);
    const a = await pendingApproval(ownerId, tipId, approvalId);
    if (!a?.approvalRef || a.releaseDeadline === null) return notFound;
    if (!approver) return { error: "no_approver" as const, status: 409 as const };
    const m = messageFor(row, a.approvalRef as Hex, a.releaseDeadline as bigint);
    const { escrow, chainId } = chain.releaseDomain();
    let valid: boolean;
    try {
      valid = await chain.verifyRelease(approver, releaseTypedData(m, escrow, chainId), signature);
    } catch {
      throw new Abort({ error: "chain_error", status: 502, code: "VerifyUnavailable" });
    }
    if (!valid) return { error: "bad_signature" as const, status: 400 as const };
    await db().update(approvals).set({ releaseSignature: signature }).where(eq(approvals.id, a.id));
    return { ok: true as const };
  });
}

/** The hold's own guards (404, 409 not_pending, 410) first, so a resolved tip reads as resolved. */
export async function holdProblem(ownerId: string, tipId: Hex, now: Date = new Date()): Promise<ActionError | null> {
  return unwrap(async () => {
    checked(await findHold(db(), tipId), ownerId, now);
    return null;
  });
}

export type Signed = SignedApproval & { method: string };

/** The owner's pending approval with a stored signature, for `start`. */
export async function signedApproval(
  ownerId: string,
  tipId: Hex,
  approvalId: string,
): Promise<Signed | typeof notFound | NoSignature | NoApprover> {
  const a = await pendingApproval(ownerId, tipId, approvalId);
  if (!a?.approvalRef || a.releaseDeadline === null) return notFound;
  if (!a.releaseSignature) return { error: "no_signature", status: 409 };
  const approver = await approverOfOwner(ownerId);
  if (!approver) return { error: "no_approver", status: 409 };
  return {
    id: a.id,
    method: a.method,
    approvalRef: a.approvalRef as Hex,
    deadline: a.releaseDeadline,
    signature: a.releaseSignature as Hex,
    approver,
  };
}
