// Pure view logic for /dashboard: turns the /api/dashboard JSON into what the page renders.
// No fetching and no React here, so every rule is tested in node.
import type { Dashboard, Money, PackageRow, RecentEvent, Tally } from "@/lib/multibaas/dashboard";
import { DASHBOARD as C, fill } from "@/lib/copy/dashboard";
import { usdc } from "./format";

export type { Dashboard, Money, PackageRow, RecentEvent, Tally };

export interface DashboardError {
  status: number;
  error: string;
  kind: string | null;
  detail: string | null;
}

/** The 503 body `{error, kind, detail}`; any other failure keeps its status and message. */
export function toDashboardError(status: number, body: unknown, fallback: string): DashboardError {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { status, error: str(b.error) ?? fallback, kind: str(b.kind), detail: str(b.detail) };
}

export const money = (m: Money) => usdc(m.usdc);

export interface HeldLine {
  label: string;
  count: number;
  amount: string;
}

export interface CardsView {
  paid: { amount: string; sub: string };
  projects: { count: number; sub: string };
  held: HeldLine[];
  refused: { count: number; sub: string };
  reserved: { amount: string; sub: string; packages: { key: string; name: string | null; href: string | null; amount: string }[] };
}

export function cardsView(d: Dashboard): CardsView {
  const { paid, projects, held, refused, reserved } = d.cards;
  const line = (label: string, t: Tally): HeldLine => ({ label, count: t.count, amount: money(t.amount) });
  const waiting = [...reserved.packages].sort((a, b) => cmpMicro(b.amount, a.amount) || byName(a, b));
  return {
    paid: { amount: money(paid.amount), sub: fill(C.CARD_PAID_SUB, { count: paid.count }) },
    projects: { count: projects.count, sub: C.CARD_PROJECTS_SUB },
    held: [
      line(C.HELD_PENDING, held.pending),
      line(C.HELD_APPROVED, held.approved),
      line(C.HELD_DENIED, held.denied),
      line(C.HELD_EXPIRED, held.expired),
    ],
    refused: { count: refused.count, sub: C.CARD_REFUSED_SUB },
    reserved: {
      amount: money(reserved.amount),
      sub: fill(C.CARD_RESERVED_SUB, { count: reserved.packages.length }),
      packages: waiting.map((p) => ({ key: p.packageKey, name: p.name, href: npmHref(p.name), amount: money(p.amount) })),
    },
  };
}

/** `/npm/<name>`, scoped names kept as two path segments (the route is `[...name]`). */
export function npmHref(name: string | null): string | null {
  if (!name) return null;
  return `/npm/${name.split("/").map(encodeURIComponent).join("/")}`;
}

function cmpMicro(a: Money, b: Money): number {
  const x = BigInt(a.micro);
  const y = BigInt(b.micro);
  return x === y ? 0 : x < y ? -1 : 1;
}

function byName(a: { name: string | null; packageKey: string }, b: { name: string | null; packageKey: string }) {
  if (a.name && !b.name) return -1;
  if (!a.name && b.name) return 1;
  return (a.name ?? a.packageKey).localeCompare(b.name ?? b.packageKey);
}

/** Most money first (paid + reserved), then most sessions, then named before unnamed, then name. */
export function sortPackages(rows: PackageRow[]): PackageRow[] {
  const total = (r: PackageRow) => BigInt(r.paid.micro) + BigInt(r.reserved.micro);
  return [...rows].sort((a, b) => {
    const ta = total(a);
    const tb = total(b);
    if (ta !== tb) return ta > tb ? -1 : 1;
    if (a.sessions !== b.sessions) return b.sessions - a.sessions;
    return byName(a, b);
  });
}

/** Newest block first; the API order is kept within a block. */
export function sortRecent(rows: RecentEvent[]): RecentEvent[] {
  return rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => b.block - a.block || i - j).map(([r]) => r);
}

/**
 * Parses both the ISO strings our DB gives (`2026-09-25T18:46:24.000Z`) and the Postgres text
 * MultiBaas returns (`2026-09-25 18:46:24+00`). Anything unparseable is null, never "now".
 */
export function parseTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  let t = s.trim().replace(" ", "T");
  t = t.replace(/([+-]\d{2})$/, "$1:00").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function relativeTime(s: string | null | undefined, now: number): string {
  const d = parseTime(s);
  if (!d) return C.NO_VALUE;
  const sec = Math.round((now - d.getTime()) / 1000);
  if (sec < 5) return C.JUST_NOW;
  if (sec < 60) return fill(C.SECONDS_AGO, { n: sec });
  if (sec < 3600) return fill(C.MINUTES_AGO, { n: Math.floor(sec / 60) });
  if (sec < 86_400) return fill(C.HOURS_AGO, { n: Math.floor(sec / 3600) });
  return fill(C.DAYS_AGO, { n: Math.floor(sec / 86_400) });
}

/** UTC, to the second, for footers and tooltips. */
export function absoluteTime(s: string | null | undefined): string {
  const d = parseTime(s);
  return d ? `${d.toISOString().slice(0, 19).replace("T", " ")} UTC` : C.NO_VALUE;
}

/** A bytes32 subject (tip id or package key) as `0xc13c5d…e488`. */
export function shortHex(h: string): string {
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h;
}

/** The package name for a package key when the table knows it, else the shortened key. */
export function subjectLabel(subject: string, packages: PackageRow[]): { label: string; href: string | null } {
  const p = packages.find((r) => r.packageKey.toLowerCase() === subject.toLowerCase());
  return p?.name ? { label: p.name, href: npmHref(p.name) } : { label: shortHex(subject), href: null };
}
