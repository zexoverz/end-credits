// Hook stdin (decisions.md "CONFIRM: Claude Code hooks") and the never-throw error log.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { errorsLog, isSessionId } from "./paths";

export interface HookInput {
  session_id: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  reason?: string;
}

export function parseHookInput(raw: string): HookInput {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("hook input is not an object");
  const input = parsed as HookInput;
  if (!isSessionId(input.session_id)) throw new Error("hook input has no valid session_id");
  if (input.cwd !== undefined && typeof input.cwd !== "string") throw new Error("bad cwd");
  return input;
}

export function readStdin(): string {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function logError(home: string, command: string, err: unknown): void {
  try {
    const message = err instanceof Error ? err.message : String(err);
    mkdirSync(home, { recursive: true, mode: 0o700 });
    appendFileSync(errorsLog(home), `${new Date().toISOString()} ${command} ${message}\n`);
  } catch {
    // The hook never breaks a session, not even when the log cannot be written.
  }
}
