// `endcredits init`: merge our hooks into a Claude Code settings file (DESIGN §4.1, decisions.md
// "CONFIRM: Claude Code hooks"). Existing hooks are never replaced; a second run changes nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface HookCommand {
  type: string;
  command: string;
  timeout?: number;
}
export interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}
export interface Settings {
  [key: string]: unknown;
  hooks: Record<string, HookGroup[]>;
}

export const RECORD_MATCHER = "Read|Grep|Glob|Write|Edit|MultiEdit|WebFetch|Bash";

const OURS: Record<string, HookGroup> = {
  SessionStart: { hooks: [{ type: "command", command: "endcredits start" }] },
  PostToolUse: {
    matcher: RECORD_MATCHER,
    hooks: [{ type: "command", command: "endcredits record" }],
  },
  SessionEnd: { hooks: [{ type: "command", command: "endcredits settle", timeout: 15 }] },
};

function hasCommand(groups: HookGroup[], command: string): boolean {
  return groups.some((g) => Array.isArray(g?.hooks) && g.hooks.some((h) => h?.command === command));
}

export function mergeHooks(input: Record<string, unknown>): Settings {
  const existing = (input.hooks ?? {}) as Record<string, HookGroup[]>;
  const hooks: Record<string, HookGroup[]> = { ...existing };
  for (const [event, group] of Object.entries(OURS)) {
    const groups = Array.isArray(existing[event]) ? existing[event] : [];
    hooks[event] = hasCommand(groups, group.hooks[0].command)
      ? groups
      : [...groups, structuredClone(group)];
  }
  return { ...input, hooks };
}

export type InitResult = "added" | "unchanged" | "invalid";

export function runInit(settingsPath: string): InitResult {
  let current: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
      current = parsed as Record<string, unknown>;
    } catch {
      return "invalid";
    }
  }
  const merged = mergeHooks(current);
  if (JSON.stringify(merged) === JSON.stringify(current)) return "unchanged";
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n");
  return "added";
}

// MCP registration (decisions.md "MCP server"): project scope is `.mcp.json` at the project root,
// `{"mcpServers": {name: {type, command, args, env}}}`. An existing entry is never replaced.
export const MCP_NAME = "end-credits";
export const MCP_ENTRY = { type: "stdio", command: "endcredits", args: ["mcp"], env: {} };
export const MCP_ADD_GLOBAL = `claude mcp add --scope user ${MCP_NAME} -- endcredits mcp`;

export function mergeMcp(input: Record<string, unknown>): Record<string, unknown> {
  const raw = input.mcpServers;
  const servers = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (MCP_NAME in servers) return input;
  return { ...input, mcpServers: { ...servers, [MCP_NAME]: structuredClone(MCP_ENTRY) } };
}

export function runMcpInit(mcpJsonPath: string): InitResult {
  let current: Record<string, unknown> = {};
  if (existsSync(mcpJsonPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
      current = parsed as Record<string, unknown>;
    } catch {
      return "invalid";
    }
  }
  const merged = mergeMcp(current);
  if (merged === current) return "unchanged";
  writeFileSync(mcpJsonPath, JSON.stringify(merged, null, 2) + "\n");
  return "added";
}
