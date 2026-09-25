// `endcredits record` (PostToolUse, DESIGN §4.3). At most one ledger line per call, no network,
// nothing on stdout, never throws. File paths of written code are hashed before they are kept.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { extractSpecifiers, packagesFromInstall } from "../../lib/attribution/specifier";
import type { LedgerLine } from "../../lib/attribution/types";
import { readPathsFromBash } from "./bash";
import { logError, parseHookInput } from "./hook";
import { ledgerPath, sessionsDir } from "./paths";

type Input = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const underNodeModules = (p: string | undefined) => !!p && p.includes("node_modules/");

function readLine(p: string | undefined): LedgerLine | null {
  return p && underNodeModules(p) ? { t: "read", p } : null;
}

function codeLine(filePath: string | undefined, code: string): LedgerLine | null {
  if (!filePath) return null;
  const specs = extractSpecifiers(code);
  if (specs.length === 0) return null;
  return { t: "code", f: createHash("sha256").update(filePath).digest("hex"), specs };
}

function bashLine(command: string | undefined): LedgerLine | null {
  if (!command) return null;
  const pkgs = packagesFromInstall(command);
  if (pkgs.length > 0) return { t: "add", pkgs };
  const ps = readPathsFromBash(command);
  return ps.length > 0 ? { t: "read", ps } : null;
}

function multiEditCode(edits: unknown): string {
  if (!Array.isArray(edits)) return "";
  return edits.map((e) => str((e as Input)?.new_string) ?? "").join("\n");
}

export function lineFor(tool: string | undefined, rawInput: unknown): LedgerLine | null {
  if (!rawInput || typeof rawInput !== "object") return null;
  const input = rawInput as Input;
  switch (tool) {
    case "Read":
      return readLine(str(input.file_path));
    case "Grep":
    case "Glob":
      return readLine(str(input.path)) ?? readLine(str(input.pattern));
    case "Write":
      return codeLine(str(input.file_path), str(input.content) ?? "");
    case "Edit":
      return codeLine(str(input.file_path), str(input.new_string) ?? "");
    case "MultiEdit":
      return codeLine(str(input.file_path), multiEditCode(input.edits));
    case "WebFetch": {
      const u = str(input.url);
      return u ? { t: "docs", u } : null;
    }
    case "Bash":
      return bashLine(str(input.command));
    default:
      return null;
  }
}

export function runRecord(raw: string, home: string): void {
  try {
    const input = parseHookInput(raw);
    const line = lineFor(input.tool_name, input.tool_input);
    if (!line) return;
    mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
    appendFileSync(ledgerPath(home, input.session_id), JSON.stringify(line) + "\n");
  } catch (err) {
    logError(home, "record", err);
  }
}
