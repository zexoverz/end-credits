// Settlement of one session (DESIGN §7). Every outside call is a dependency so the orchestration is
// tested against a real Postgres with fakes; `deps.ts` wires the real registry, resolver,
// Intercepta, escrow and x402 client.
//
// Order per credit: resolve the payee (phase 1, all credits), then screen, decide, store the
// decision, and only then sign or send anything (phase 2, amount desc). AGENTS rules 6 and 7.
import { keccak256, stringToBytes, type Address, type Hash, type Hex } from "viem";
import type { HoldArgs, SessionTotals } from "../chain/escrow";
import { TxRevertedError } from "../chain/txqueue";
import { findLookalike } from "../decision/lookalike";
import { decide } from "../decision/matrix";
import { applySimulation, type SimulationOutcome } from "../decision/simulation";
import { spamCount, type SessionPackage } from "../decision/spam";
import { HOLD_REASON_CODE, type Decision, type Reason, type Screen } from "../decision/types";
import { msg, type MessageCode } from "../messages";
import { CHANGE_WINDOW_DAYS, recentlyChanged, type Change } from "../payee/change";
import { packageKey, tipId } from "../payee/keys";
import type { ObservationStore } from "../payee/observe";
import type { PackageRef, Resolution } from "../payee/resolve";
import { RegistryNotFound, type NpmPackageWithDownloads } from "../registry/npm";
import { split } from "../allocation/split";
import { PaymentRefused, type ClientCredit } from "../x402/client";
import { manifestOf } from "./manifest";
import { scoreUsage } from "./scores";
import * as store from "./store";

export type SettleDeps = {
  database: store.Database;
  usdc: Address;
  payer: Address;
  observations: ObservationStore;
  loadPackage(name: string, version?: string): Promise<NpmPackageWithDownloads>;
  resolvePayee(pkg: PackageRef): Promise<Resolution>;
  /** GitHub push time of a funding file (T2.6); omitted → our own observations only. */
  pushedAt?(repo: string, file: string, since: Date): Promise<Date | null>;
  screenPayee(payee: Address, opts: { from: Address; amount: bigint }): Promise<Screen>;
  /** Intercepta simulation of this exact payment; only for a paid or capped decision. */
  simulatePayment(payee: Address, amount: bigint): Promise<SimulationOutcome & { screenId?: string }>;
  /** P1, only when CHECK_NO_CODE=true. */
  noCodeOnBase?(payee: Address): Promise<boolean>;
  escrow: {
    reserve(packageKey: Hex, amount: bigint, sessionKey: Hex): Promise<Hash>;
    hold(a: HoldArgs): Promise<Hash>;
    recordSession(s: SessionTotals): Promise<Hash>;
  };
  payCredit(credit: ClientCredit): Promise<{ tx: string; receipt: unknown }>;
  now?: () => Date;
  concurrency?: number;
  log?: (line: string) => void;
};

type Work = {
  creditId: string;
  packageId: string;
  name: string;
  version?: string;
  amount: bigint;
  capped: boolean;
  pkgKey: Hex;
  tip: Hex;
  // filled in phase 1
  registry?: NpmPackageWithDownloads;
  resolution?: Resolution;
  change?: Change;
  noCode?: boolean;
  lookupError?: string;
  // filled in phase 2
  outcome?: string;
  tx?: string | null;
};

const DAY_MS = 86_400_000;
const FUNDING_FILE: Record<string, string> = { drips: "FUNDING.json", tea: "tea.yaml" };

export async function settleSession(sessionId: string, deps: SettleDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const { database } = deps;
  const ctx = await store.loadSettleContext(database, sessionId);
  const { session, owner } = ctx;

  const spent = await store.spentToday(database, owner.id, now());
  const left = owner.dailyLimitMicro - spent;
  const budget = left < owner.sessionBudgetMicro ? left : owner.sessionBudgetMicro;

  const scored = scoreUsage(ctx.usage);
  const versions = new Map(ctx.usage.map((u) => [u.packageName, u.version ?? undefined]));
  const ids = await store.ensurePackages(database, scored.map((p) => p.name));
  const sessionKey = session.sessionKey as Hex;

  if (budget <= BigInt(0)) {
    const reason = policy("DAILY_LIMIT");
    await store.insertCredits(
      database,
      scored.map((p) => ({
        sessionId,
        packageId: ids.get(p.name)!,
        score: p.score,
        role: p.role,
        amountMicro: BigInt(0),
        outcome: "dust",
        reasons: [reason],
        decidedAt: now(),
      })),
    );
    await store.finishSession(database, sessionId, { budgetMicro: BigInt(0), manifestHash: null, recordTx: null });
    return;
  }

  const shares = split(new Map(scored.map((p) => [p.name, p.score])), budget, owner.packageCapMicro);
  // Rows first, outcome null, so the roll lists every package while decisions land one by one.
  const creditIds = await store.insertCredits(
    database,
    scored.map((p) => {
      const share = shares.get(p.name)!;
      const pkgKey = packageKey(p.name);
      return {
        sessionId,
        packageId: ids.get(p.name)!,
        score: p.score,
        role: p.role,
        amountMicro: share.amount,
        capped: share.capped,
        tipId: tipId(sessionKey, pkgKey),
        ...(share.dust ? { outcome: "dust", reasons: [policy("DUST")], decidedAt: now() } : {}),
      };
    }),
  );

  const work: Work[] = scored
    .filter((p) => !shares.get(p.name)!.dust)
    .map((p) => {
      const pkgKey = packageKey(p.name);
      const share = shares.get(p.name)!;
      return {
        creditId: creditIds.get(ids.get(p.name)!)!,
        packageId: ids.get(p.name)!,
        name: p.name,
        version: versions.get(p.name),
        amount: share.amount,
        capped: share.capped,
        pkgKey,
        tip: tipId(sessionKey, pkgKey),
      };
    })
    .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));

  const limit = deps.concurrency ?? 3;
  await mapLimit(work, limit, (w) => lookup(w, deps, now()));
  await mapLimit(work, limit, (w) => decideAndExecute(w, work, { ...deps, now }, sessionKey, owner.holdTtlSeconds));

  const manifest = manifestOf(
    work.map((w) => ({
      package: w.name,
      amount: w.amount,
      outcome: w.outcome ?? null,
      payee: w.resolution?.address ?? null,
      tx: w.tx ?? null,
    })),
  );
  const sum = (pred: (w: Work) => boolean) => work.filter(pred).reduce((a, w) => a + w.amount, BigInt(0));
  const sent = (w: Work) => !!w.tx;
  const recordTx = await deps.escrow.recordSession({
    sessionId: sessionKey,
    ownerHash: (owner.subHash as Hex | null) ?? keccak256(stringToBytes(owner.id)),
    budget,
    paid: sum((w) => (w.outcome === "paid" || w.outcome === "capped") && sent(w)),
    held: sum((w) => w.outcome === "held" && sent(w)),
    reserved: sum((w) => w.outcome === "reserved" && sent(w)),
    refused: sum((w) => w.outcome === "refused"),
    manifestHash: manifest.hash,
  });
  await store.finishSession(database, sessionId, { budgetMicro: budget, manifestHash: manifest.hash, recordTx });
}

// Phase 1: registry, payee, change detection. Tried twice; a second failure refuses the credit
// (nothing is paid when we cannot tell who the payee is).
async function lookup(w: Work, deps: SettleDeps, now: Date): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const registry = await registryOrDeclared(w, deps);
      await store.saveRegistry(deps.database, w.packageId, registry, now);
      const resolution = await deps.resolvePayee({
        id: w.packageId,
        name: w.name,
        repoFullName: registry.repoFullName,
        repoDirectory: registry.repoDirectory,
        funding: registry.funding,
      });
      await store.setPayee(deps.database, w.creditId, resolution.address, resolution.address ? resolution.source : null);
      Object.assign(w, { registry, resolution });
      if (resolution.address) {
        w.change = await changeOf(w, resolution.address, resolution.source, deps, now);
        w.noCode = deps.noCodeOnBase ? await deps.noCodeOnBase(resolution.address) : false;
      }
      w.lookupError = undefined;
      return;
    } catch (err) {
      w.lookupError = errorLabel(err);
    }
  }
}

// A registry 404 falls back to the repo the uploader's package.json declared; downloads and first
// publish stay unknown. Any other registry error still fails the lookup.
async function registryOrDeclared(w: Work, deps: SettleDeps): Promise<NpmPackageWithDownloads> {
  try {
    return await deps.loadPackage(w.name, w.version);
  } catch (err) {
    if (!(err instanceof RegistryNotFound)) throw err;
    const declared = await store.declaredRepo(deps.database, w.packageId);
    if (!declared) throw err;
    return {
      name: w.name,
      version: w.version ?? null,
      ...declared,
      funding: null,
      fundingLinks: [],
      createdAt: null,
      weeklyDownloads: null,
      repoSource: "declared",
    };
  }
}

function changeOf(w: Work, address: Address, source: string, deps: SettleDeps, now: Date): Promise<Change> {
  const file = FUNDING_FILE[source];
  const repo = w.registry?.repoFullName;
  const pushedAt =
    deps.pushedAt && file && repo
      ? () => deps.pushedAt!(repo, file, new Date(now.getTime() - CHANGE_WINDOW_DAYS * DAY_MS))
      : undefined;
  return recentlyChanged(deps.observations, w.packageId, address, { now, pushedAt });
}

// Phase 2: screen, decide, store the decision, then execute.
async function decideAndExecute(
  w: Work,
  all: Work[],
  deps: SettleDeps & { now: () => Date },
  sessionKey: Hex,
  ttlSeconds: number,
): Promise<void> {
  const { database } = deps;
  if (w.lookupError || !w.resolution) {
    w.outcome = "refused";
    const reasons = [{ source: "payee" as const, code: "RESOLVE_FAILED" as const, text: msg("RESOLVE_FAILED", { error: w.lookupError ?? "unknown" }) }];
    await store.recordDecision(database, w.creditId, { outcome: "refused", reasons, screenIds: [] }, deps.now());
    return;
  }

  const payee = w.resolution.address;
  const screen = payee ? await screenSafely(payee, w.amount, deps) : null;
  const matrix = decide({
    pkg: w.name,
    payee,
    paymentToken: deps.usdc,
    screen,
    capped: w.capped,
    amount: w.amount,
    change: w.change ?? { changed: false },
    lookalike: payee ? findLookalike(payee, await store.knownPayees(database, w.packageId)) : null,
    spam: payee ? spamCount(payee, sessionPackages(all), deps.now()) : null,
    noCodeOnBase: w.noCode ?? false,
  });
  // One simulation per credit about to be paid, read before the decision is stored.
  const sim = payee && (matrix.outcome === "paid" || matrix.outcome === "capped") ? await simulateSafely(payee, w.amount, deps) : null;
  const decision = sim && payee ? applySimulation(matrix, sim, { payee, amount: w.amount }) : matrix;
  const screenIds = [...(screen?.screenIds ?? []), ...(sim?.screenId ? [sim.screenId] : [])];
  const reasons = [...decision.reasons, ...payeeReason(w.resolution), ...declaredReason(w)];
  w.outcome = decision.outcome;
  await store.recordDecision(
    database,
    w.creditId,
    { outcome: decision.outcome, reasons, screenIds },
    deps.now(),
  );

  try {
    w.tx = await execute(w, decision, deps, sessionKey, ttlSeconds);
  } catch (err) {
    w.tx = null;
    const code = executionFailureCode(err);
    const text = code === "EXECUTION_FAILED" ? msg(code, { error: errorLabel(err) }) : msg(code);
    await store.appendReason(database, w.creditId, { source: "policy", code, text });
    deps.log?.(`settle: credit ${w.creditId} ${decision.outcome} not executed: ${errorLabel(err)}`);
  }
}

async function execute(
  w: Work,
  d: Decision,
  deps: SettleDeps & { now: () => Date },
  sessionKey: Hex,
  ttlSeconds: number,
): Promise<string | null> {
  const { database } = deps;
  const payee = w.resolution?.address ?? null;
  switch (d.outcome) {
    case "paid":
    case "capped": {
      // The x402 route is idempotent on tx_hash; never start a second payment for a paid credit.
      const existing = await store.creditTx(database, w.creditId);
      if (existing) return existing;
      const { tx, receipt } = await deps.payCredit({ id: w.creditId, payee: payee!, amountMicro: w.amount });
      await store.recordExecution(database, w.creditId, { txHash: tx, receipt }, deps.now());
      return tx;
    }
    case "held": {
      const tx = await deps.escrow.hold({
        tipId: w.tip,
        packageKey: w.pkgKey,
        payee: payee!,
        amount: w.amount,
        reason: HOLD_REASON_CODE[d.holdReason ?? "SCREEN"],
        ttlSeconds,
      });
      const at = deps.now();
      await store.insertHold(database, {
        creditId: w.creditId,
        tipId: w.tip,
        expiresAt: new Date(at.getTime() + ttlSeconds * 1000),
        holdTx: tx,
      });
      await store.recordExecution(database, w.creditId, { txHash: tx }, at);
      return tx;
    }
    case "reserved": {
      const tx = await deps.escrow.reserve(w.pkgKey, w.amount, sessionKey);
      await store.recordExecution(database, w.creditId, { txHash: tx }, deps.now());
      return tx;
    }
    default:
      return null; // refused: nothing is sent
  }
}

// A screen that throws (e.g. the screens insert failed) is a screen error: held, never paid.
async function screenSafely(payee: Address, amount: bigint, deps: SettleDeps): Promise<Screen> {
  try {
    return await deps.screenPayee(payee, { from: deps.payer, amount });
  } catch {
    return { toxicScore: 0, traits: [], tokenAction: "info", tokenDetectors: [], error: "HTTP", screenIds: [] };
  }
}

// A simulation that throws is a simulation error: held, never paid (AGENTS rule 7).
async function simulateSafely(payee: Address, amount: bigint, deps: SettleDeps): Promise<SimulationOutcome & { screenId?: string }> {
  try {
    return await deps.simulatePayment(payee, amount);
  } catch {
    return { ok: false, error: "HTTP" };
  }
}

function sessionPackages(all: Work[]): SessionPackage[] {
  return all.map((w) => ({
    name: w.name,
    payee: w.resolution?.address ?? null,
    weeklyDownloads: w.registry?.weeklyDownloads ?? null,
    firstPublishedAt: w.registry?.createdAt ?? null,
  }));
}

// SPOOF_REPO or PAYEE_INVALID from resolution, shown with the reserved decision.
function payeeReason(r: Resolution): Reason[] {
  if (r.address || !r.reason) return [];
  return [{ source: "payee", code: r.reason, text: msg(r.reason, r.vars ?? {}) }];
}

function declaredReason(w: Work): Reason[] {
  return w.registry?.repoSource === "declared"
    ? [{ source: "payee", code: "REPO_DECLARED", text: msg("REPO_DECLARED") }]
    : [];
}

function policy(code: MessageCode): Reason {
  return { source: "policy", code, text: msg(code) };
}

// Escrow v2: `hold` reverts `NoApprover` in the simulation, before anything is signed, when the
// payer has named no approver. The decision stays held; nothing moves.
function executionFailureCode(err: unknown): MessageCode {
  if (err instanceof PaymentRefused) return err.code;
  if (err instanceof TxRevertedError && err.errorName === "NoApprover") return "NO_APPROVER";
  return "EXECUTION_FAILED";
}

/** A short, secret-free label for an error: never the message, which may carry an RPC URL. */
export function errorLabel(err: unknown): string {
  if (err instanceof PaymentRefused) return err.code;
  if (err instanceof TxRevertedError) return `${err.functionName}: ${err.errorName}`;
  return err instanceof Error ? err.name : "error";
}

export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}
