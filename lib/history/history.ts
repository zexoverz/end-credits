// `/history` data (DESIGN §12): every decided credit, newest first, with its reasons, the screens it
// was decided on and its tx. Public like the roll: payees are shortened, nothing names the owner.
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { reasonList, type StoredReason } from "../approve/reasons";
import { db } from "../db/client";
import { credits, holds, packages, screens } from "../db/schema";
import { msg } from "../messages";
import { basescanTx, formatUsdc } from "../money";
import { shortAddress } from "../sessions/view";

export const HISTORY_LIMIT = 200;

export interface ScreenView {
  id: string;
  kind: string;
  status: number;
  latencyMs: number;
  mappedFrom: string | null;
  screenedAs: string | null;
  fetchedAt: string;
}

export interface HistoryItem {
  creditId: string;
  sessionId: string;
  package: string;
  role: string;
  outcome: string | null;
  amount: string;
  capped: boolean;
  payee: string | null;
  reasons: StoredReason[];
  screens: ScreenView[];
  txHash: string | null;
  txUrl: string | null;
  /** `maintainer_x402` | `endcredits_x402` on a paid credit, else null. */
  paidVia: string | null;
  decidedAt: string;
  settledAt: string | null;
  hold: { status: string; expiresAt: string; releaseTx: string | null; refundTx: string | null } | null;
}

async function screensById(ids: string[]): Promise<Map<string, ScreenView>> {
  if (ids.length === 0) return new Map();
  const rows = await db()
    .select({
      id: screens.id,
      kind: screens.kind,
      status: screens.status,
      latencyMs: screens.latencyMs,
      mappedFrom: screens.mappedFrom,
      fetchedAt: screens.fetchedAt,
    })
    .from(screens)
    .where(inArray(screens.id, ids));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...r,
        screenedAs: r.mappedFrom ? msg("SCREENED_AS") : null,
        fetchedAt: r.fetchedAt.toISOString(),
      },
    ]),
  );
}

export async function creditHistory(limit: number = HISTORY_LIMIT): Promise<HistoryItem[]> {
  const rows = await db()
    .select({
      creditId: credits.id,
      sessionId: credits.sessionId,
      name: packages.name,
      role: credits.role,
      outcome: credits.outcome,
      amountMicro: credits.amountMicro,
      capped: credits.capped,
      payee: credits.payee,
      reasons: credits.reasons,
      screenIds: credits.screenIds,
      txHash: credits.txHash,
      paidVia: credits.paidVia,
      decidedAt: credits.decidedAt,
      settledAt: credits.settledAt,
      holdStatus: holds.status,
      holdExpiresAt: holds.expiresAt,
      releaseTx: holds.releaseTx,
      refundTx: holds.refundTx,
    })
    .from(credits)
    .innerJoin(packages, eq(packages.id, credits.packageId))
    .leftJoin(holds, eq(holds.creditId, credits.id))
    .where(isNotNull(credits.decidedAt))
    .orderBy(desc(credits.decidedAt), desc(credits.id))
    .limit(Math.min(limit, HISTORY_LIMIT));
  const byId = await screensById([...new Set(rows.flatMap((r) => r.screenIds))]);
  return rows.map((r) => ({
    creditId: r.creditId,
    sessionId: r.sessionId,
    package: r.name,
    role: r.role,
    outcome: r.outcome,
    amount: formatUsdc(r.amountMicro),
    capped: r.capped,
    payee: shortAddress(r.payee),
    reasons: reasonList(r.reasons),
    screens: r.screenIds.flatMap((id) => byId.get(id) ?? []),
    txHash: r.txHash,
    txUrl: basescanTx(r.txHash),
    paidVia: r.paidVia,
    decidedAt: r.decidedAt!.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
    hold:
      r.holdStatus && r.holdExpiresAt
        ? {
            status: r.holdStatus,
            expiresAt: r.holdExpiresAt.toISOString(),
            releaseTx: r.releaseTx,
            refundTx: r.refundTx,
          }
        : null,
  }));
}
