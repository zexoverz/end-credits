// "Actions to take" and the hourly timeline for /api/dashboard. Pending holds, reserve balances and
// every amount come from MultiBaas rows; our DB only adds package names, payees and reason texts.
import { formatUnits } from "viem";
import { msg, sessionsLabel } from "../messages";
import { eventName, field, toBytes32, toMicro, type Row } from "./rows";

export const EXPIRING_SOON_MS = 2 * 60 * 60 * 1000;
export const TIMELINE_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;

type Money = { micro: string; usdc: string };
const money = (micro: bigint): Money => ({ micro: micro.toString(), usdc: formatUnits(micro, 6) });

export type ActionKind = "approve_hold" | "hold_expiring" | "reserve_waiting";
export interface Action {
  kind: ActionKind;
  title: string;
  detail: string | null;
  href: string;
  amount: Money;
  source: "multibaas" | "db";
  // Extra fields the page may show; all optional per kind.
  tipId?: string;
  package?: string | null;
  packageKey?: string;
  payee?: string | null;
  expiresAt?: string;
  sessions?: number;
}

export interface HoldInfo {
  tipId: string;
  package: string;
  payee: string | null;
  reasons: { text: string }[];
}

export interface PendingHold {
  tipId: string;
  amount: bigint;
  expiresAt: number; // ms, from Held.expiresAt
}

/** Tips with a Held row and no Released or Refunded row. */
export function pendingHolds(heldRows: Row[]): PendingHold[] {
  const held = new Map<string, PendingHold>();
  const resolved = new Set<string>();
  for (const r of heldRows) {
    const name = eventName(field(r, "event"));
    const tipId = toBytes32(field(r, "tip_id"));
    if (name === "Held") {
      held.set(tipId, { tipId, amount: toMicro(field(r, "amount")), expiresAt: Number(toMicro(field(r, "detail"))) * 1000 });
    } else if (name === "Released" || name === "Refunded") resolved.add(tipId);
  }
  return [...held.values()].filter((h) => !resolved.has(h.tipId));
}

export interface ActionInput {
  pending: PendingHold[];
  holds: Map<string, HoldInfo>;
  reserves: { packageKey: string; name: string | null; amount: bigint; sessions: number }[];
  now: number;
}

/** Expiring warnings first, then holds to approve (soonest expiry first), then reserves (largest
 *  first). A hold already past its expiry can no longer be released and is left out. */
export function buildActions({ pending, holds, reserves, now }: ActionInput): Action[] {
  const live = pending.filter((h) => h.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
  const holdAction = (h: PendingHold, kind: "approve_hold" | "hold_expiring"): Action => {
    const info = holds.get(h.tipId);
    const pkg = info?.package ?? null;
    const amount = money(h.amount);
    const expiresAt = new Date(h.expiresAt).toISOString();
    const label = pkg ?? h.tipId;
    return {
      kind,
      title:
        kind === "approve_hold"
          ? msg("ACTION_APPROVE", { amount: amount.usdc, package: label })
          : msg("ACTION_EXPIRING", { amount: amount.usdc, package: label, time: expiresAt }),
      detail: info?.reasons.map((r) => r.text).join(" ") || null,
      href: `/app/approve/${h.tipId}`,
      amount,
      source: "multibaas",
      tipId: h.tipId,
      package: pkg,
      payee: info?.payee ?? null,
      expiresAt,
    };
  };
  const expiring = live.filter((h) => h.expiresAt - now <= EXPIRING_SOON_MS).map((h) => holdAction(h, "hold_expiring"));
  const approve = live.map((h) => holdAction(h, "approve_hold"));
  const waiting = reserves
    .filter((r) => r.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    .map((r): Action => {
      const amount = money(r.amount);
      const label = r.name ?? r.packageKey;
      return {
        kind: "reserve_waiting",
        title: msg("ACTION_RESERVE", { amount: amount.usdc, package: label, sessions: sessionsLabel(r.sessions) }),
        detail: null,
        href: r.name ? `/app/npm/${r.name}` : `/app/packages`,
        amount,
        source: "multibaas",
        package: r.name,
        packageKey: r.packageKey,
        sessions: r.sessions,
      };
    });
  return [...expiring, ...approve, ...waiting];
}

export const TIMELINE_SERIES = ["paid", "held", "released", "refunded", "reserved", "claimed"] as const;
export type TimelineSeries = (typeof TIMELINE_SERIES)[number];
export type TimelineBucket = { hour: string } & Record<TimelineSeries, Money>;

const EVENT_SERIES: Record<string, TimelineSeries> = {
  Held: "held",
  Released: "released",
  Refunded: "refunded",
  Reserved: "reserved",
  Claimed: "claimed",
};

/** MultiBaas `triggered_at` comes back as Postgres text (`2026-09-26 10:38:38+00`) or ISO. */
export function parseTriggeredAt(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = v
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

/** Start of the oldest hour in the timeline window. */
export function timelineStart(now: number): number {
  return Math.floor(now / HOUR_MS) * HOUR_MS - (TIMELINE_HOURS - 1) * HOUR_MS;
}

/** Per UTC hour, oldest first. `paid` are payer → payee transfers (escrow already excluded);
 *  the escrow series come from `recent` rows. Rows outside the window are ignored. */
export function buildTimeline(paid: { amount: bigint; at: unknown }[], escrowRows: Row[], now: number): TimelineBucket[] {
  const start = timelineStart(now);
  const sums = Array.from({ length: TIMELINE_HOURS }, () =>
    Object.fromEntries(TIMELINE_SERIES.map((k) => [k, 0n])) as Record<TimelineSeries, bigint>,
  );
  const add = (at: unknown, series: TimelineSeries, amount: bigint) => {
    const ms = parseTriggeredAt(at);
    if (ms === null || ms < start) return;
    const i = Math.floor((ms - start) / HOUR_MS);
    if (i < TIMELINE_HOURS) sums[i][series] += amount;
  };
  for (const t of paid) add(t.at, "paid", t.amount);
  for (const r of escrowRows) {
    const series = EVENT_SERIES[eventName(field(r, "event"))];
    if (series) add(r.at, series, toMicro(field(r, "amount")));
  }
  return sums.map((s, i) => ({
    hour: new Date(start + i * HOUR_MS).toISOString(),
    ...(Object.fromEntries(TIMELINE_SERIES.map((k) => [k, money(s[k])])) as Record<TimelineSeries, Money>),
  }));
}
