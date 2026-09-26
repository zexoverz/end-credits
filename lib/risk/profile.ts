// Counterparty risk profile for one address, from our own DB only: the Intercepta screens we stored,
// the packages that named this address as payee (with every other address those packages named),
// and what we decided for it across sessions. No Intercepta call is made here.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { formatUnits, getAddress, isAddress } from "viem";
import { db } from "../db/client";
import { credits, packages, payeeObservations, screens } from "../db/schema";
import { reusable } from "../intercepta/cache";
import { Impersonation, QuickScan, Simulation } from "../intercepta/schemas";

type Database = ReturnType<typeof db>;

export type Money = { micro: string; usdc: string };
const money = (micro: bigint): Money => ({ micro: micro.toString(), usdc: formatUnits(micro, 6) });

export type AddressVerdict = {
  toxicScore: number;
  traits: { name: string; description: string; risk: number | null }[];
  noHistory: boolean;
  screenedAt: string;
};
export type ImpersonationVerdict = { isAddressPoisoned: boolean; originalAddress: string | null; screenedAt: string };
export type SimulationVerdict = { detectors: { code: string; description: string }[]; screenedAt: string };

export type PackageAddress = { address: string; source: string; firstObservedAt: string; lastObservedAt: string; current: boolean };
export type PayeeOf = {
  package: string;
  packageKey: string;
  source: string;
  sourceUrl: string;
  firstObservedAt: string;
  lastObservedAt: string;
  current: boolean; // this address is the package's latest observed payee
  changed: boolean; // the package has named more than one address
  addresses: PackageAddress[]; // oldest first
};

export type Reason = { source: string; code: string; text: string };

export const OUTCOMES = ["paid", "capped", "held", "refused", "reserved", "dust"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type RiskProfile = {
  address: string;
  source: "db";
  screens: { count: number; firstAt: string | null; lastAt: string | null };
  intercepta: {
    address: AddressVerdict | null;
    impersonation: ImpersonationVerdict | null;
    simulation: SimulationVerdict | null;
  };
  payeeOf: PayeeOf[];
  decisions: {
    count: number;
    sessions: number;
    byOutcome: Record<Outcome, { count: number; amount: Money }>;
    last: {
      package: string;
      outcome: string;
      amount: Money;
      decidedAt: string;
      reasons: Reason[];
    } | null;
  };
};

/** Checksummed or all-lowercase 0x address → lowercase; anything else → null. */
export function normalizeAddress(raw: string): string | null {
  const a = raw.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(a) && isAddress(a, { strict: true }) ? a.toLowerCase() : null;
}

const iso = (d: Date) => d.toISOString();
const lowerEq = (col: typeof credits.payee | typeof payeeObservations.address, a: string) => sql`lower(${col}) = ${a}`;

type ScreenRow = typeof screens.$inferSelect;

function addressVerdict(row: ScreenRow | undefined): AddressVerdict | null {
  if (!row) return null;
  if (row.status !== 200) return { toxicScore: 0, traits: [], noHistory: true, screenedAt: iso(row.fetchedAt) };
  const p = QuickScan.safeParse(row.response);
  if (!p.success) return null;
  return {
    toxicScore: p.data.toxicScore,
    traits: p.data.traits.map((t) => ({ name: t.name, description: t.description, risk: t.risk ?? null })),
    noHistory: p.data.noHistory === true,
    screenedAt: iso(row.fetchedAt),
  };
}

function impersonationVerdict(row: ScreenRow | undefined): ImpersonationVerdict | null {
  const p = row && row.status === 200 ? Impersonation.safeParse(row.response) : null;
  if (!row || !p?.success) return null;
  return { isAddressPoisoned: p.data.isAddressPoisoned, originalAddress: p.data.originalAddress ?? null, screenedAt: iso(row.fetchedAt) };
}

function simulationVerdict(row: ScreenRow | undefined): SimulationVerdict | null {
  const p = row && row.status === 200 ? Simulation.safeParse(row.response) : null;
  if (!row || !p?.success) return null;
  return { detectors: p.data.detectors, screenedAt: iso(row.fetchedAt) };
}

async function screenPart(database: Database, a: string) {
  const rows = await database
    .select()
    .from(screens)
    .where(and(eq(screens.subject, a), inArray(screens.kind, ["address", "impersonation", "simulation"])))
    .orderBy(asc(screens.fetchedAt));
  // Newest successful row per kind; failed calls count as screens but never as a verdict.
  const latest = (kind: string) => rows.filter((r) => r.kind === kind && reusable(r)).at(-1);
  return {
    screens: {
      count: rows.length,
      firstAt: rows.length ? iso(rows[0].fetchedAt) : null,
      lastAt: rows.length ? iso(rows[rows.length - 1].fetchedAt) : null,
    },
    intercepta: {
      address: addressVerdict(latest("address")),
      impersonation: impersonationVerdict(latest("impersonation")),
      simulation: simulationVerdict(latest("simulation")),
    },
  };
}

async function payeePart(database: Database, a: string): Promise<PayeeOf[]> {
  const named = await database
    .selectDistinct({ packageId: payeeObservations.packageId })
    .from(payeeObservations)
    .where(lowerEq(payeeObservations.address, a));
  if (named.length === 0) return [];
  const rows = await database
    .select({
      packageId: payeeObservations.packageId,
      name: packages.name,
      packageKey: packages.packageKey,
      address: payeeObservations.address,
      source: payeeObservations.source,
      sourceUrl: payeeObservations.sourceUrl,
      observedAt: payeeObservations.observedAt,
    })
    .from(payeeObservations)
    .innerJoin(packages, eq(packages.id, payeeObservations.packageId))
    .where(inArray(payeeObservations.packageId, named.map((n) => n.packageId)))
    .orderBy(asc(payeeObservations.observedAt));

  const byPkg = new Map<string, typeof rows>();
  for (const r of rows) byPkg.set(r.packageId, [...(byPkg.get(r.packageId) ?? []), r]);
  return [...byPkg.values()].map((obs) => {
    const newest = obs[obs.length - 1].address.toLowerCase();
    const addrs = new Map<string, PackageAddress>();
    for (const o of obs) {
      const key = o.address.toLowerCase();
      const prev = addrs.get(key);
      addrs.set(key, {
        address: getAddress(key),
        source: o.source,
        firstObservedAt: prev?.firstObservedAt ?? iso(o.observedAt),
        lastObservedAt: iso(o.observedAt),
        current: key === newest,
      });
    }
    const mine = obs.filter((o) => o.address.toLowerCase() === a);
    const last = mine[mine.length - 1];
    return {
      package: obs[0].name,
      packageKey: obs[0].packageKey,
      source: last.source,
      sourceUrl: last.sourceUrl,
      firstObservedAt: iso(mine[0].observedAt),
      lastObservedAt: iso(last.observedAt),
      current: newest === a,
      changed: addrs.size > 1,
      addresses: [...addrs.values()],
    };
  });
}

async function decisionPart(database: Database, a: string): Promise<RiskProfile["decisions"]> {
  const rows = await database
    .select({
      name: packages.name,
      sessionId: credits.sessionId,
      outcome: credits.outcome,
      amountMicro: credits.amountMicro,
      reasons: credits.reasons,
      decidedAt: credits.decidedAt,
    })
    .from(credits)
    .innerJoin(packages, eq(packages.id, credits.packageId))
    .where(and(lowerEq(credits.payee, a), sql`${credits.outcome} is not null`))
    .orderBy(asc(credits.decidedAt));
  const byOutcome = Object.fromEntries(
    OUTCOMES.map((o) => {
      const of = rows.filter((r) => r.outcome === o);
      return [o, { count: of.length, amount: money(of.reduce((s, r) => s + r.amountMicro, 0n)) }];
    }),
  ) as RiskProfile["decisions"]["byOutcome"];
  const last = rows.filter((r) => r.decidedAt).at(-1);
  return {
    count: rows.length,
    sessions: new Set(rows.map((r) => r.sessionId)).size,
    byOutcome,
    last: last
      ? {
          package: last.name,
          outcome: last.outcome!,
          amount: money(last.amountMicro),
          decidedAt: iso(last.decidedAt!),
          reasons: Array.isArray(last.reasons) ? (last.reasons as Reason[]) : [],
        }
      : null,
  };
}

/** `address` must already be normalized (lowercase). An address we never saw → an empty profile. */
export async function riskProfile(address: string, database: Database = db()): Promise<RiskProfile> {
  const a = address.toLowerCase();
  const [screenData, payeeOf, decisions] = await Promise.all([
    screenPart(database, a),
    payeePart(database, a),
    decisionPart(database, a),
  ]);
  return { address: getAddress(a), source: "db", ...screenData, payeeOf, decisions };
}
