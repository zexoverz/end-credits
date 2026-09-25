// /api/dashboard data (DESIGN §12 `/dashboard`, §15). Amounts and counts come from MultiBaas saved
// queries; our DB only supplies package names, the tx → package mapping for x402 payments, the last
// decision per package, and the refused count (refusals have no chain event; labelled as such).
// Any MultiBaas failure propagates: the route answers 503 with the error, never a made-up number.
import { formatUnits } from "viem";
import { MultiBaasError, type MultiBaasClient } from "./client";
import { QUERY_LABELS, USDC_ALIAS } from "./queries";
import {
  eventName,
  field,
  optionalString,
  queryRows,
  toAddress,
  toBlock,
  toBool,
  toBytes32,
  toMicro,
  type Row,
} from "./rows";

export interface DashboardRepo {
  packageNames(keys: string[]): Promise<Map<string, string>>;
  creditsByTx(txHashes: string[]): Promise<{ txHash: string; packageKey: string; sessionKey: string }[]>;
  refusedCount(): Promise<number>;
  lastDecisions(keys: string[]): Promise<{ packageKey: string; outcome: string | null; decidedAt: Date | null }[]>;
}

export interface DashboardDeps {
  mb: MultiBaasClient;
  repo: DashboardRepo;
  payer: string;
  escrow: string;
  now?: () => number;
}

export interface Money {
  micro: string;
  usdc: string;
}
export interface Tally {
  count: number;
  amount: Money;
}
export interface PackageRow {
  packageKey: string;
  name: string | null;
  sessions: number;
  paid: Money;
  reserved: Money;
  lastDecision: { outcome: string | null; at: string | null } | null;
}
export interface RecentEvent {
  event: string;
  subject: string;
  amount: Money;
  block: number;
  tx: string;
  at: string | null;
}
export interface Dashboard {
  source: "multibaas";
  generatedAt: string;
  escrow: string;
  payer: string;
  cards: {
    paid: Tally;
    projects: { count: number };
    held: { approved: Tally; denied: Tally; expired: Tally; pending: Tally };
    refused: { count: number; source: "decision_log" };
    reserved: { amount: Money; packages: { packageKey: string; name: string | null; amount: Money }[] };
  };
  packages: PackageRow[];
  sessions: { count: number };
  recent: RecentEvent[];
}

export const CACHE_TTL_MS = 60_000;
export const RECENT_LIMIT = 50;

const money = (micro: bigint): Money => ({ micro: micro.toString(), usdc: formatUnits(micro, 6) });
const tally = (count: number, micro: bigint): Tally => ({ count, amount: money(micro) });
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

interface Transfer {
  recipient: string;
  amount: bigint;
  tx: string;
}

function paidTransfers(rows: Row[], payer: string, escrow: string): Transfer[] {
  const from = payer.toLowerCase();
  const esc = escrow.toLowerCase();
  return rows
    .filter((r) => field(r, "contract") === USDC_ALIAS && toAddress(field(r, "sender")) === from)
    .map((r) => ({
      recipient: toAddress(field(r, "recipient")),
      amount: toMicro(field(r, "amount")),
      tx: toBytes32(field(r, "tx")),
    }))
    .filter((t) => t.recipient !== esc);
}

function heldCard(rows: Row[]): Dashboard["cards"]["held"] {
  const held = new Map<string, bigint>();
  const resolved = new Map<string, { kind: "approved" | "denied" | "expired"; amount: bigint }>();
  for (const r of rows) {
    const name = eventName(field(r, "event"));
    const tip = toBytes32(field(r, "tip_id"));
    const amount = toMicro(field(r, "amount"));
    if (name === "Held") held.set(tip, amount);
    else if (name === "Released") resolved.set(tip, { kind: "approved", amount });
    else if (name === "Refunded") {
      resolved.set(tip, { kind: toBool(field(r, "detail")) ? "expired" : "denied", amount });
    }
  }
  const of = (kind: string) => [...resolved.values()].filter((x) => x.kind === kind).map((x) => x.amount);
  const pending = [...held].filter(([tip]) => !resolved.has(tip)).map(([, a]) => a);
  return {
    approved: tally(of("approved").length, sum(of("approved"))),
    denied: tally(of("denied").length, sum(of("denied"))),
    expired: tally(of("expired").length, sum(of("expired"))),
    pending: tally(pending.length, sum(pending)),
  };
}

function recentEvents(rows: Row[]): RecentEvent[] {
  return rows.slice(0, RECENT_LIMIT).map((r) => ({
    event: eventName(field(r, "event")),
    subject: toBytes32(field(r, "subject")),
    amount: money(toMicro(field(r, "amount"))),
    block: toBlock(field(r, "block")),
    tx: toBytes32(field(r, "tx")),
    at: optionalString(r.at),
  }));
}

export async function buildDashboard(deps: DashboardDeps): Promise<Dashboard> {
  const { mb, repo } = deps;
  const [paidRows, heldRows, reservedRows, reserveRows, sessionRows, recentRows] = await Promise.all([
    queryRows(mb, QUERY_LABELS.paid),
    queryRows(mb, QUERY_LABELS.held),
    queryRows(mb, QUERY_LABELS.reserved),
    queryRows(mb, QUERY_LABELS.reservedSessions),
    queryRows(mb, QUERY_LABELS.sessions),
    queryRows(mb, QUERY_LABELS.recent, { limit: RECENT_LIMIT, all: false }),
  ]);

  const transfers = paidTransfers(paidRows, deps.payer, deps.escrow);
  const reservedBalance = new Map(
    reservedRows.map((r) => [toBytes32(field(r, "package_key")), toMicro(field(r, "amount"))] as const),
  );
  const sessionsByPkg = new Map<string, Set<string>>();
  const addSession = (pkg: string, session: string) =>
    sessionsByPkg.set(pkg, (sessionsByPkg.get(pkg) ?? new Set()).add(session));
  for (const r of reserveRows) addSession(toBytes32(field(r, "package_key")), toBytes32(field(r, "session_id")));

  const credits = transfers.length ? await repo.creditsByTx(transfers.map((t) => t.tx)) : [];
  const creditByTx = new Map(credits.map((c) => [c.txHash.toLowerCase(), c]));
  const paidByPkg = new Map<string, bigint>();
  for (const t of transfers) {
    const c = creditByTx.get(t.tx);
    if (!c) continue; // a transfer from the payer that is not a credit payment (e.g. a smoke test)
    const pkg = c.packageKey.toLowerCase();
    paidByPkg.set(pkg, (paidByPkg.get(pkg) ?? 0n) + t.amount);
    addSession(pkg, c.sessionKey.toLowerCase());
  }

  const keys = [...new Set([...paidByPkg.keys(), ...reservedBalance.keys(), ...sessionsByPkg.keys()])];
  const [names, decisions, refused] = await Promise.all([
    keys.length ? repo.packageNames(keys) : new Map<string, string>(),
    keys.length ? repo.lastDecisions(keys) : [],
    repo.refusedCount(),
  ]);
  const decisionByKey = new Map(decisions.map((d) => [d.packageKey.toLowerCase(), d]));

  const packages: PackageRow[] = keys.map((k) => {
    const d = decisionByKey.get(k);
    return {
      packageKey: k,
      name: names.get(k) ?? null,
      sessions: sessionsByPkg.get(k)?.size ?? 0,
      paid: money(paidByPkg.get(k) ?? 0n),
      reserved: money(reservedBalance.get(k) ?? 0n),
      lastDecision: d ? { outcome: d.outcome, at: d.decidedAt?.toISOString() ?? null } : null,
    };
  });
  const waiting = [...reservedBalance].filter(([, a]) => a > 0n);

  return {
    source: "multibaas",
    generatedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
    escrow: deps.escrow,
    payer: deps.payer,
    cards: {
      paid: tally(transfers.length, sum(transfers.map((t) => t.amount))),
      projects: { count: new Set([...paidByPkg.keys(), ...reservedBalance.keys()]).size },
      held: heldCard(heldRows),
      refused: { count: refused, source: "decision_log" },
      reserved: {
        amount: money(sum(waiting.map(([, a]) => a))),
        packages: waiting.map(([k, a]) => ({ packageKey: k, name: names.get(k) ?? null, amount: money(a) })),
      },
    },
    packages,
    sessions: { count: sessionRows.length },
    recent: recentEvents(recentRows),
  };
}

// In-process cache. The webhook invalidates it; the generation counter keeps a build that started
// before an invalidation from being stored after it.
let cache: { at: number; value: Dashboard } | undefined;
let generation = 0;

export function invalidateDashboardCache(): void {
  cache = undefined;
  generation++;
}

export async function getDashboard(deps: DashboardDeps): Promise<Dashboard> {
  const now = deps.now ?? Date.now;
  if (cache && now() - cache.at <= CACHE_TTL_MS) return cache.value;
  const gen = generation;
  const value = await buildDashboard(deps);
  if (gen === generation) cache = { at: now(), value };
  return value;
}

export async function dashboardResponse(deps: DashboardDeps | (() => DashboardDeps)): Promise<Response> {
  try {
    const d = typeof deps === "function" ? deps() : deps;
    return Response.json(await getDashboard(d), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const error = e instanceof MultiBaasError ? "multibaas_unavailable" : "dashboard_unavailable";
    const kind = e instanceof MultiBaasError ? e.kind : undefined;
    return Response.json({ error, kind, detail }, { status: 503 });
  }
}
