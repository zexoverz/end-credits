// Public read of one session for the roll (DESIGN §6.2). Payees are shortened; nothing here
// identifies the owner.
import { eq } from "drizzle-orm";
import { formatUnits } from "viem";
import { WEIGHT, type Signal } from "../attribution/types";
import { db } from "../db/client";
import { credits, packages, sessions, usage } from "../db/schema";

const ROLE_ORDER = ["starring", "featuring", "research", "thanks"];
const USDC_DECIMALS = 6;

export interface CreditView {
  package: string;
  role: string;
  outcome: string | null;
  amount: string;
  capped: boolean;
  reasons: unknown;
  signal: MainSignal | null;
  txHash: string | null;
  payee: string | null;
}

export interface SessionView {
  id: string;
  status: string;
  settleRequested: boolean;
  repoLabel: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordTx: string | null;
  credits: CreditView[];
}

export interface MainSignal {
  signal: string;
  count: number;
}

type UsageRow = { packageName: string; signal: string; count: number };

const weightOf = (s: string) => WEIGHT[s as Signal] ?? 0;

/** Per package, the signal that contributed most (weight × count; the heavier signal on a tie). */
export function mainSignals(rows: UsageRow[]): Map<string, MainSignal> {
  const out = new Map<string, MainSignal>();
  for (const r of rows) {
    const cur = out.get(r.packageName);
    const score = weightOf(r.signal) * r.count;
    const curScore = cur ? weightOf(cur.signal) * cur.count : -1;
    const heavier = cur !== undefined && weightOf(r.signal) > weightOf(cur.signal);
    if (score > curScore || (score === curScore && heavier)) {
      out.set(r.packageName, { signal: r.signal, count: r.count });
    }
  }
  return out;
}

export const shortAddress = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);

type Row = { role: string; amountMicro: bigint; name: string };

export function rollOrder(a: Row, b: Row): number {
  const byRole = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  if (byRole !== 0) return byRole;
  if (a.amountMicro !== b.amountMicro) return a.amountMicro > b.amountMicro ? -1 : 1;
  return a.name < b.name ? -1 : 1;
}

export async function sessionView(id: string): Promise<SessionView | null> {
  const [session] = await db().select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return null;
  const rows = await db()
    .select({
      name: packages.name,
      role: credits.role,
      outcome: credits.outcome,
      amountMicro: credits.amountMicro,
      capped: credits.capped,
      reasons: credits.reasons,
      txHash: credits.txHash,
      payee: credits.payee,
    })
    .from(credits)
    .innerJoin(packages, eq(packages.id, credits.packageId))
    .where(eq(credits.sessionId, id));
  const signals = mainSignals(
    await db()
      .select({ packageName: usage.packageName, signal: usage.signal, count: usage.count })
      .from(usage)
      .where(eq(usage.sessionId, id)),
  );
  return {
    id: session.id,
    status: session.status,
    settleRequested: session.settleRequestedAt !== null,
    repoLabel: session.repoLabel,
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    recordTx: session.recordTx,
    credits: [...rows].sort(rollOrder).map((r) => ({
      package: r.name,
      role: r.role,
      outcome: r.outcome,
      amount: formatUnits(r.amountMicro, USDC_DECIMALS),
      capped: r.capped,
      reasons: r.reasons,
      signal: signals.get(r.name) ?? null,
      txHash: r.txHash,
      payee: shortAddress(r.payee),
    })),
  };
}
