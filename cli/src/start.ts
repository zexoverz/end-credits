// `endcredits start` (SessionStart, DESIGN §4.2): snapshot the project's direct deps. Its stdout
// would be added to Claude's context, so it prints nothing and never throws.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logError, parseHookInput } from "./hook";
import { sessionsDir, startPath } from "./paths";

export interface StartSnapshot {
  cwd: string;
  startedAt: string;
  deps: Record<string, string>;
}

const asRecord = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};

export function readDeps(cwd: string): Record<string, string> {
  const file = path.join(cwd, "package.json");
  if (!existsSync(file)) return {};
  const pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return { ...asRecord(pkg.dependencies), ...asRecord(pkg.devDependencies) };
}

export function runStart(raw: string, home: string): void {
  try {
    const input = parseHookInput(raw);
    const file = startPath(home, input.session_id);
    if (existsSync(file)) return; // resume, clear or compact: keep the first snapshot
    const cwd = input.cwd ?? process.cwd();
    const snapshot: StartSnapshot = { cwd, startedAt: new Date().toISOString(), deps: readDeps(cwd) };
    mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(snapshot));
  } catch (err) {
    logError(home, "start", err);
  }
}
