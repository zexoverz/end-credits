// Ledger → per-package signals, score and role (DESIGN §5, SPEC §5.1). Pure: the caller decides
// what is installed and passes each installed package's metadata in.
import { docsPackage, type PackageMeta } from "./docs";
import { isValidPackageName, pathToPackage, specifierToPackage } from "./specifier";
import {
  CAP,
  SIGNALS,
  WEIGHT,
  type LedgerLine,
  type PackageAttribution,
  type Role,
  type Signal,
  type SignalUse,
} from "./types";

export { docsPackage, repoUrl, type PackageMeta } from "./docs";

export interface AttributeInput {
  lines: LedgerLine[];
  startDeps: string[];
  endDeps: string[];
  installed: Record<string, PackageMeta>; // name → metadata, only packages present in node_modules
}

interface Tally {
  files: Set<string>; // hashed paths of files that import it
  reads: Set<string>; // paths inside the package
  docs: Map<string, string>; // url → evidence
  added: boolean;
}

const STARRING = 3;
const ROLE_OF: Record<Signal, Role> = {
  dep_added: "featuring",
  import: "featuring",
  docs: "research",
  read: "thanks",
};

function readPaths(line: Extract<LedgerLine, { t: "read" }>): string[] {
  return [...(line.p ? [line.p] : []), ...(line.ps ?? [])];
}

export function candidateNames(lines: LedgerLine[], deps: string[]): string[] {
  const names = new Set(deps.filter(isValidPackageName));
  for (const line of lines) {
    if (line.t === "code") {
      for (const spec of line.specs) {
        const name = specifierToPackage(spec);
        if (name) names.add(name);
      }
    } else if (line.t === "read") {
      for (const p of readPaths(line)) {
        const hit = pathToPackage(p);
        if (hit) names.add(hit.name);
      }
    } else if (line.t === "add") {
      line.pkgs.filter(isValidPackageName).forEach((n) => names.add(n));
    }
  }
  return [...names];
}

function tally(input: AttributeInput): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  const of = (name: string) => {
    let t = tallies.get(name);
    if (!t) tallies.set(name, (t = { files: new Set(), reads: new Set(), docs: new Map(), added: false }));
    return t;
  };
  for (const line of input.lines) {
    if (line.t === "code") {
      for (const spec of line.specs) {
        const name = specifierToPackage(spec);
        if (name) of(name).files.add(line.f);
      }
    } else if (line.t === "read") {
      for (const p of readPaths(line)) {
        const hit = pathToPackage(p);
        if (hit) of(hit.name).reads.add(hit.inner);
      }
    } else if (line.t === "docs") {
      const hit = docsPackage(line.u, input.installed);
      if (hit) of(hit.name).docs.set(line.u, hit.ambiguous ? `ambiguous ${line.u}` : line.u);
    } else if (line.t === "add") {
      line.pkgs.forEach((n) => (of(n).added = true));
    }
  }
  const atStart = new Set(input.startDeps);
  input.endDeps.filter((n) => !atStart.has(n)).forEach((n) => (of(n).added = true));
  return tallies;
}

function capped(items: Iterable<string>, cap: number, withEvidence: boolean): SignalUse | undefined {
  const list = [...items];
  if (list.length === 0) return undefined;
  const count = Math.min(list.length, cap);
  return withEvidence ? { count, evidence: list.slice(0, cap) } : { count };
}

function signalsFor(t: Tally, direct: boolean): Partial<Record<Signal, SignalUse>> {
  const out: Partial<Record<Signal, SignalUse>> = {};
  if (direct && t.added) out.dep_added = { count: CAP.dep_added };
  const imp = direct ? capped(t.files, CAP.import, false) : undefined;
  if (imp) out.import = imp;
  const docs = capped(t.docs.values(), CAP.docs, true);
  if (docs) out.docs = docs;
  const read = capped(t.reads, CAP.read, true);
  if (read) out.read = read;
  return out;
}

const scoreOf = (signals: Partial<Record<Signal, SignalUse>>) =>
  SIGNALS.reduce((sum, s) => sum + WEIGHT[s] * (signals[s]?.count ?? 0), 0);

function leadSignal(signals: Partial<Record<Signal, SignalUse>>): Signal {
  let lead: Signal = "read";
  let best = -1;
  for (const s of SIGNALS) {
    const weighted = WEIGHT[s] * (signals[s]?.count ?? 0);
    if (weighted > best) [lead, best] = [s, weighted];
  }
  return lead;
}

export function attribute(input: AttributeInput): PackageAttribution[] {
  const direct = new Set(input.endDeps);
  const scored: Omit<PackageAttribution, "role">[] = [];
  for (const [name, t] of tally(input)) {
    if (!Object.hasOwn(input.installed, name)) continue;
    const signals = signalsFor(t, direct.has(name));
    const score = scoreOf(signals);
    if (score === 0) continue;
    const version = input.installed[name].version;
    scored.push({ name, ...(version ? { version } : {}), signals, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  return scored.map((p, i) => ({
    ...p,
    role: i < STARRING ? "starring" : ROLE_OF[leadSignal(p.signals)],
  }));
}
