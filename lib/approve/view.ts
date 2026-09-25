// What the phone page (`/approve/[tipId]`) shows for one held tip. Public by tip id: the package,
// amount and reason are on the public roll already; the full payee is what the owner approves.
import { desc, eq } from "drizzle-orm";
import type { Hex } from "viem";
import { db } from "../db/client";
import { approvals } from "../db/schema";
import { msg } from "../messages";
import { formatUsdc } from "../money";
import { findHold } from "./hold";
import { holdReasonText, reasonList } from "./reasons";

export type ApproveStatus = "pending" | "approved" | "denied" | "expired";

export interface ApproveView {
  tipId: string;
  sessionId: string;
  package: string;
  amount: string;
  payee: string | null;
  reason: string | null;
  sentence: string;
  status: ApproveStatus;
  expiresAt: string;
  worldRequired: boolean;
  signedIn: boolean;
  isOwner: boolean;
  txHash: string | null;
  message: string | null;
  failureCode: string | null;
}

const OUTCOME_CODES = new Set(["APPROVED", "APPROVED_SESSION", "DENIED", "EXPIRED"]);

function statusOf(holdStatus: string, expiresAt: Date, now: Date): ApproveStatus {
  if (holdStatus === "released") return "approved";
  if (holdStatus === "denied") return "denied";
  if (holdStatus === "expired") return "expired";
  return expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
}

async function lastFailure(holdId: string): Promise<string | null> {
  const [last] = await db()
    .select({ status: approvals.status, failureCode: approvals.failureCode })
    .from(approvals)
    .where(eq(approvals.holdId, holdId))
    .orderBy(desc(approvals.startedAt), desc(approvals.completedAt))
    .limit(1);
  return last?.status === "failed" ? last.failureCode : null;
}

export async function approveView(
  tipId: Hex,
  viewer: { ownerId: string } | null,
  opts: { worldRequired: boolean; now?: Date },
): Promise<ApproveView | null> {
  const row = await findHold(db(), tipId);
  if (!row) return null;
  const amount = formatUsdc(row.amountMicro);
  const status = statusOf(row.status, row.expiresAt, opts.now ?? new Date());
  const outcome = reasonList(row.reasons).findLast((r) => OUTCOME_CODES.has(r.code));
  return {
    tipId: row.tipId,
    sessionId: row.sessionId,
    package: row.packageName,
    amount,
    payee: row.payee,
    reason: holdReasonText(row.reasons),
    sentence: msg("APPROVE_SENTENCE", { amount, address: row.payee ?? "", package: row.packageName }),
    status,
    expiresAt: row.expiresAt.toISOString(),
    worldRequired: opts.worldRequired,
    signedIn: viewer !== null,
    isOwner: viewer?.ownerId === row.ownerId,
    txHash: row.releaseTx ?? row.refundTx,
    message: status === "pending" ? null : (outcome?.text ?? null),
    failureCode: status === "pending" ? await lastFailure(row.holdId) : null,
  };
}
