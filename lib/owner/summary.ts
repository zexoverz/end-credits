// `/owner` data (DESIGN §12): payer and its USDC balance, pending holds, unread notifications.
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import type { Address } from "viem";
import { holdReasonText } from "../approve/reasons";
import { db } from "../db/client";
import { credits, holds, notifications, packages, sessions } from "../db/schema";
import { formatUsdc } from "../money";
import { budgetView, type BudgetChain, type BudgetView } from "./budget";
import { ownerRow, settingsView, type SettingsView } from "./settings";

export interface SummaryDeps {
  balanceOf(address: Address): Promise<bigint>;
  /** The budget wallet reads; omitted → `budget: null`. */
  budget?: BudgetChain;
}

export interface PendingHold {
  tipId: string;
  sessionId: string;
  package: string;
  amount: string;
  payee: string | null;
  reason: string | null;
  expiresAt: string;
  expired: boolean;
}

export interface OwnerSummary {
  owner: { id: string; displayName: string };
  /** Escrow v2: the owner's approver wallet as stored; the on-chain state is at /api/owner/approver. */
  approver: string | null;
  settings: SettingsView;
  /** The owner's budget wallet (EndCreditsBudget), same shape as GET /api/owner/budget. */
  budget: BudgetView | null;
  payer: { address: string; usdcBalance: string | null; error: "rpc_unavailable" | null };
  pendingHolds: PendingHold[];
  notifications: {
    unread: number;
    items: { id: string; kind: string; holdId: string | null; tipId: string | null; createdAt: string }[];
  };
}

const BALANCE_TIMEOUT_MS = 5_000;
const NOTIFICATION_LIMIT = 20;

async function payerBalance(address: string, deps: SummaryDeps): Promise<OwnerSummary["payer"]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), BALANCE_TIMEOUT_MS);
  });
  try {
    const balance = await Promise.race([deps.balanceOf(address as Address), timeout]);
    return { address, usdcBalance: formatUsdc(balance), error: null };
  } catch {
    // The RPC error can carry the provider URL (and its key); only a code goes out.
    return { address, usdcBalance: null, error: "rpc_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

async function pendingHolds(ownerId: string, now: Date): Promise<PendingHold[]> {
  const rows = await db()
    .select({
      tipId: holds.tipId,
      expiresAt: holds.expiresAt,
      sessionId: sessions.id,
      name: packages.name,
      amountMicro: credits.amountMicro,
      payee: credits.payee,
      reasons: credits.reasons,
    })
    .from(holds)
    .innerJoin(credits, eq(credits.id, holds.creditId))
    .innerJoin(sessions, eq(sessions.id, credits.sessionId))
    .innerJoin(packages, eq(packages.id, credits.packageId))
    .where(and(eq(sessions.ownerId, ownerId), eq(holds.status, "pending")))
    .orderBy(asc(holds.expiresAt));
  return rows.map((r) => ({
    tipId: r.tipId,
    sessionId: r.sessionId,
    package: r.name,
    amount: formatUsdc(r.amountMicro),
    payee: r.payee,
    reason: holdReasonText(r.reasons),
    expiresAt: r.expiresAt.toISOString(),
    expired: r.expiresAt.getTime() <= now.getTime(),
  }));
}

async function unreadNotifications(ownerId: string): Promise<OwnerSummary["notifications"]> {
  const unread = and(eq(notifications.ownerId, ownerId), isNull(notifications.readAt));
  const [{ n }] = await db().select({ n: count() }).from(notifications).where(unread);
  const items = await db()
    .select({
      id: notifications.id,
      kind: notifications.kind,
      holdId: notifications.holdId,
      tipId: holds.tipId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(holds, eq(holds.id, notifications.holdId))
    .where(unread)
    .orderBy(desc(notifications.createdAt))
    .limit(NOTIFICATION_LIMIT);
  return { unread: n, items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })) };
}

export async function ownerSummary(
  ownerId: string,
  deps: SummaryDeps,
  now: Date = new Date(),
): Promise<OwnerSummary | null> {
  const owner = await ownerRow(ownerId);
  if (!owner) return null;
  const [payer, holdsList, notes, budget] = await Promise.all([
    payerBalance(owner.payerAddress, deps),
    pendingHolds(ownerId, now),
    unreadNotifications(ownerId),
    deps.budget ? budgetView(owner.budgetOwner, deps.budget) : null,
  ]);
  return {
    owner: { id: owner.id, displayName: owner.displayName },
    approver: owner.approverAddress ?? null,
    settings: settingsView(owner),
    budget,
    payer,
    pendingHolds: holdsList,
    notifications: notes,
  };
}
