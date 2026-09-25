// Client logic for the credits roll: grouping by role, the totals line, when to keep polling.
// Pure, so the page stays thin and this stays tested.
import { ROLL_COPY, type RollRole } from "../copy/roll";
import type { CreditView, SessionView } from "../sessions/view";

export const POLL_MS = 1000;
export const ROLE_ORDER: RollRole[] = ["starring", "featuring", "research", "thanks"];
const LIVE = new Set(["uploaded", "settling"]);
const USDC_DECIMALS = 6;

export interface RoleGroup {
  role: RollRole;
  label: string;
  credits: CreditView[];
}

export interface Totals {
  paidMicro: bigint;
  paidCount: number;
  heldMicro: bigint;
  reservedMicro: bigint;
  reservedCount: number;
  refusedCount: number;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Keep polling while the session can still change. */
export function isLive(status: string): boolean {
  return LIVE.has(status);
}

/** Non-empty groups in roll order; credits keep the API's order inside a group. */
export function groupByRole(credits: CreditView[]): RoleGroup[] {
  return ROLE_ORDER.map((role) => ({
    role,
    label: ROLL_COPY.ROLES[role],
    credits: credits.filter((c) => c.role === role),
  })).filter((g) => g.credits.length > 0);
}

/** "0.25" → 250000n. Amounts come from the API as decimal USDC strings. */
export function toMicro(amount: string): bigint {
  const m = /^(\d+)(?:\.(\d{0,6}))?$/.exec(amount.trim());
  if (!m) return 0n;
  return BigInt(m[1]) * 10n ** BigInt(USDC_DECIMALS) + BigInt((m[2] ?? "").padEnd(USDC_DECIMALS, "0"));
}

export function fromMicro(micro: bigint): string {
  const base = 10n ** BigInt(USDC_DECIMALS);
  const frac = (micro % base).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${micro / base}.${frac}` : `${micro / base}`;
}

export function totals(credits: CreditView[]): Totals {
  const sum = (xs: CreditView[]) => xs.reduce((a, c) => a + toMicro(c.amount), 0n);
  const paid = credits.filter((c) => c.outcome === "paid" || c.outcome === "capped");
  const held = credits.filter((c) => c.outcome === "held");
  const reserved = credits.filter((c) => c.outcome === "reserved");
  return {
    paidMicro: sum(paid),
    paidCount: paid.length,
    heldMicro: sum(held),
    reservedMicro: sum(reserved),
    reservedCount: reserved.length,
    refusedCount: credits.filter((c) => c.outcome === "refused").length,
  };
}

const projects = (n: number) => (n === 1 ? ROLL_COPY.PROJECT.one : ROLL_COPY.PROJECT.many);

/** SPEC §12.1: "Paid X to N projects. Held Y. Reserved Z for M projects without a wallet. Refused W." */
export function totalsLine(t: Totals): string {
  return [
    fill(ROLL_COPY.TOTALS_PAID, { amount: fromMicro(t.paidMicro), count: t.paidCount, projects: projects(t.paidCount) }),
    fill(ROLL_COPY.TOTALS_HELD, { amount: fromMicro(t.heldMicro) }),
    fill(ROLL_COPY.TOTALS_RESERVED, {
      amount: fromMicro(t.reservedMicro),
      count: t.reservedCount,
      projects: projects(t.reservedCount),
    }),
    fill(ROLL_COPY.TOTALS_REFUSED, { count: t.refusedCount }),
  ].join(" ");
}

/** The first reason's text; `reasons` is stored JSON, so it is read defensively. */
export function firstReason(reasons: unknown): string | null {
  if (!Array.isArray(reasons)) return null;
  const r = reasons.find((x) => typeof x === "object" && x !== null && typeof x.text === "string");
  return r ? (r.text as string) : null;
}

export function signalLine(signal: CreditView["signal"]): string | null {
  if (!signal) return null;
  const name = ROLL_COPY.SIGNALS[signal.signal as keyof typeof ROLL_COPY.SIGNALS] ?? signal.signal;
  return fill(ROLL_COPY.SIGNAL_LINE, { signal: name, count: signal.count });
}

export type SettleResult = { kind: "requested" | "sign_in" | "forbidden" | "conflict" | "error"; text: string };

/** Map the settle route's status (202 / 401 / 403 / 409 / other) to what the page shows. */
export function settleResult(status: number, error = ""): SettleResult {
  if (status === 202) return { kind: "requested", text: ROLL_COPY.ROLL_REQUESTED };
  if (status === 401) return { kind: "sign_in", text: ROLL_COPY.ROLL_SIGN_IN };
  if (status === 403) return { kind: "forbidden", text: ROLL_COPY.ROLL_FORBIDDEN };
  if (status === 409) return { kind: "conflict", text: ROLL_COPY.ROLL_CONFLICT };
  return { kind: "error", text: fill(ROLL_COPY.ROLL_FAILED, { error: error || `HTTP ${status}` }) };
}

/** The line under the title: the status, or "requested" between the press and the settler starting. */
export function statusLine(view: Pick<SessionView, "status" | "settleRequested">): string | null {
  if (view.status === "uploaded" && view.settleRequested) return ROLL_COPY.ROLL_REQUESTED;
  return ROLL_COPY.STATUS[view.status as keyof typeof ROLL_COPY.STATUS] ?? null;
}

/** The Roll credits button shows only before anyone asked the settler to start. */
export function canRoll(view: Pick<SessionView, "status" | "settleRequested">): boolean {
  return view.status === "uploaded" && !view.settleRequested;
}
