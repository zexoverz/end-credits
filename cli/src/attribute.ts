// Attribute one recorded session from local files only (DESIGN §4.4 steps 1–2). Registry
// metadata for docs mapping comes from `node_modules/<pkg>/package.json`; no network.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { attribute, candidateNames, type PackageMeta } from "../../lib/attribution/score";
import {
  MAX_PACKAGES,
  SIGNALS,
  type LedgerLine,
  type PackageAttribution,
  type SignalUse,
} from "../../lib/attribution/types";
import { cliMsg } from "../../lib/messages";
import { declaredMeta, type DeclaredRepository } from "../../lib/registry/declared";
import { endPath, ledgerPath, startPath } from "./paths";
import { readDeps, type StartSnapshot } from "./start";

export interface UploadBody {
  claudeSessionId: string;
  repoLabel?: string;
  startedAt?: string;
  endedAt: string;
  packages: {
    name: string;
    version?: string;
    repository?: DeclaredRepository;
    homepage?: string;
    signals: PackageAttribution["signals"];
  }[];
}

const LINE_TYPES = new Set(["read", "code", "docs", "add"]);

export function readLedger(home: string, id: string): LedgerLine[] {
  const file = ledgerPath(home, id);
  if (!existsSync(file)) return [];
  const lines: LedgerLine[] = [];
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    try {
      const line = JSON.parse(raw) as LedgerLine;
      if (line && LINE_TYPES.has(line.t)) lines.push(line);
    } catch {
      // a torn or foreign line is skipped, never fatal
    }
  }
  return lines;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function sessionCwd(home: string, id: string): string {
  const start = readJson<StartSnapshot>(startPath(home, id));
  const end = readJson<{ cwd?: string }>(endPath(home, id));
  return start?.cwd ?? end?.cwd ?? process.cwd();
}

function installedMeta(cwd: string, names: string[]): Record<string, PackageMeta> {
  const out: Record<string, PackageMeta> = {};
  for (const name of names) {
    const pkg = readJson<Record<string, unknown>>(path.join(cwd, "node_modules", name, "package.json"));
    if (!pkg) continue;
    out[name] = {
      version: typeof pkg.version === "string" ? pkg.version : undefined,
      homepage: typeof pkg.homepage === "string" ? pkg.homepage : undefined,
      repository: pkg.repository as PackageMeta["repository"],
    };
  }
  return out;
}

function repoLabel(cwd: string): string | undefined {
  const name = readJson<{ name?: unknown }>(path.join(cwd, "package.json"))?.name;
  return typeof name === "string" && name.length > 0 && name.length <= 100 ? name : undefined;
}

export function buildUpload(
  home: string,
  id: string,
  now: Date,
): { body: UploadBody; packages: PackageAttribution[] } {
  const start = readJson<StartSnapshot>(startPath(home, id));
  const end = readJson<{ endedAt?: string }>(endPath(home, id));
  const cwd = sessionCwd(home, id);
  const lines = readLedger(home, id);
  const endDeps = Object.keys(readDeps(cwd));
  const startDeps = start ? Object.keys(start.deps) : endDeps;
  const installed = installedMeta(cwd, candidateNames(lines, [...startDeps, ...endDeps]));
  const packages = attribute({ lines, startDeps, endDeps, installed }).slice(0, MAX_PACKAGES);
  const label = repoLabel(cwd);
  const body: UploadBody = {
    claudeSessionId: id,
    ...(label ? { repoLabel: label } : {}),
    ...(start?.startedAt ? { startedAt: start.startedAt } : {}),
    endedAt: end?.endedAt ?? now.toISOString(),
    packages: packages.map(({ name, version, signals }) => ({
      name,
      ...(version ? { version } : {}),
      // only a GitHub repo and an https homepage; a local path never leaves the machine
      ...(installed[name] ? declaredMeta(installed[name]) : {}),
      signals,
    })),
  };
  return { body, packages };
}

const signalSummary = (signals: Partial<Record<string, SignalUse>>) =>
  SIGNALS.filter((s) => signals[s])
    .map((s) => `${s} ${signals[s]!.count}`)
    .join(", ");

export function formatTable(packages: PackageAttribution[]): string {
  const rows = [
    cliMsg("TABLE_HEADER").split("|"),
    ...packages.map((p) => [p.name, p.version ?? "", p.role, String(p.score), signalSummary(p.signals)]),
  ];
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  return rows.map((r) => r.map((cell, col) => cell.padEnd(widths[col])).join("  ").trimEnd()).join("\n");
}
