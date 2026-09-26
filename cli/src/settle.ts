// `endcredits settle` (SessionEnd, DESIGN §4.4). The hook has a short budget and its output is
// discarded (decisions.md), so the hook only records the end and hands the upload and the
// browser tab to a detached child: `endcredits settle --session <id>`.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cliMsg } from "../../lib/messages";
import { buildUpload } from "./attribute";
import { readConfig } from "./config";
import { logError, parseHookInput } from "./hook";
import { donePath, endPath, ledgerPath, sessionsDir, startPath } from "./paths";

export const UPLOAD_TIMEOUT_MS = 5_000;

export interface SettleDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  open: (url: string) => void;
  say: (line: string) => void;
  now: () => Date;
  /** Upload timeout; the MCP roll tool waits longer than the hook's child. */
  timeoutMs?: number;
}

export type SettleResult = { ok: true; id: string; url: string } | { ok: false; error: string };

function rollUrl(apiUrl: string, raw: unknown): { id: string; url: string } {
  const body = (raw ?? {}) as { id?: unknown; url?: unknown };
  if (typeof body.id !== "string" || !/^[\w-]{1,64}$/.test(body.id)) {
    throw new Error("response has no session id");
  }
  const fallback = `${apiUrl}/credits/${body.id}`;
  try {
    const url = new URL(String(body.url));
    return { id: body.id, url: url.origin === new URL(apiUrl).origin ? url.href : fallback };
  } catch {
    return { id: body.id, url: fallback };
  }
}

function clearSession(home: string, id: string): void {
  for (const file of [ledgerPath(home, id), startPath(home, id), endPath(home, id)]) {
    rmSync(file, { force: true });
  }
}

async function upload(apiUrl: string, key: string, body: unknown, deps: SettleDeps) {
  const res = await deps.fetch(`${apiUrl}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(deps.timeoutMs ?? UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return rollUrl(apiUrl, await res.json());
}

function alreadySettled(home: string, id: string): { id: string; url: string } | null {
  if (existsSync(ledgerPath(home, id)) || !existsSync(donePath(home, id))) return null;
  try {
    const done = JSON.parse(readFileSync(donePath(home, id), "utf8")) as { id: string; url: string };
    return typeof done.id === "string" && typeof done.url === "string" ? done : null;
  } catch {
    return null;
  }
}

export async function settleSession(home: string, id: string, deps: SettleDeps): Promise<SettleResult> {
  const done = alreadySettled(home, id);
  if (done) {
    deps.say(cliMsg("ROLLING", { url: done.url }));
    deps.open(done.url);
    return { ok: true, ...done };
  }
  const config = readConfig(home);
  if (!config) {
    deps.say(cliMsg("KEY_MISSING"));
    return { ok: false, error: "no agent key" };
  }
  try {
    const { body } = buildUpload(home, id, deps.now());
    if (body.packages.length === 0) {
      deps.say(cliMsg("NOTHING_USED", { id }));
      clearSession(home, id);
      return { ok: false, error: "nothing used" };
    }
    const roll = await upload(config.apiUrl, config.agentKey, body, deps);
    writeFileSync(donePath(home, id), JSON.stringify(roll));
    clearSession(home, id);
    deps.say(cliMsg("ROLLING", { url: roll.url }));
    deps.open(roll.url);
    return { ok: true, ...roll };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logError(home, "settle", err);
    deps.say(cliMsg("UPLOAD_FAILED", { error, id }));
    return { ok: false, error };
  }
}

export function runSettleHook(
  raw: string,
  home: string,
  spawnChild: (id: string, cwd: string) => void,
  now: () => Date,
): void {
  try {
    const input = parseHookInput(raw);
    const cwd = input.cwd ?? process.cwd();
    mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
    writeFileSync(endPath(home, input.session_id), JSON.stringify({ endedAt: now().toISOString(), cwd }));
    spawnChild(input.session_id, cwd);
  } catch (err) {
    logError(home, "settle", err);
  }
}

export function spawnDetachedSettle(id: string, cwd: string): void {
  const child = spawn(process.execPath, [process.argv[1], "settle", "--session", id], {
    cwd,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
