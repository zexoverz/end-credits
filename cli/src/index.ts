// endcredits init | key | login | start | record | settle | attribute | mcp (DESIGN §4, §14.4)
import { existsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { cliMsg } from "../../lib/messages";
import { flag, parseArgs } from "./args";
import { buildUpload, formatTable } from "./attribute";
import { writeConfig } from "./config";
import { readStdin } from "./hook";
import { runInit } from "./init";
import { runLogin } from "./login";
import { runMcp } from "./mcp";
import { ecHome, isSessionId, ledgerPath } from "./paths";
import { runRecord } from "./record";
import { openInBrowser, runSettleHook, settleSession, spawnDetachedSettle } from "./settle";
import { runStart } from "./start";

const INIT_CODES = {
  added: "INIT_ADDED",
  unchanged: "INIT_UNCHANGED",
  invalid: "INIT_INVALID",
} as const;

function say(line: string): void {
  process.stderr.write(line + "\n");
}

function init(global: boolean): number {
  const base = global ? homedir() : process.cwd();
  const file = path.join(base, ".claude", "settings.json");
  const result = runInit(file);
  say(cliMsg(INIT_CODES[result], { path: file }));
  return result === "invalid" ? 1 : 0;
}

function key(token: string | undefined, api: string | undefined): number {
  try {
    say(cliMsg("KEY_SAVED", { path: writeConfig(ecHome(), token ?? "", api) }));
    return 0;
  } catch (err) {
    say(cliMsg("KEY_INVALID", { error: (err as Error).message }));
    return 1;
  }
}

async function settle(session: string | undefined): Promise<number> {
  const home = ecHome();
  if (session === undefined) {
    // SessionEnd hook: return at once, the detached child uploads and opens the roll.
    runSettleHook(readStdin(), home, spawnDetachedSettle, () => new Date());
    return 0;
  }
  if (!isSessionId(session)) {
    say(cliMsg("SESSION_REQUIRED"));
    return 1;
  }
  // ENDCREDITS_NO_OPEN=1 skips the browser tab (headless machines, scripted checks).
  const open = process.env.ENDCREDITS_NO_OPEN === "1" ? () => {} : openInBrowser;
  const deps = { fetch, open, say, now: () => new Date() };
  return (await settleSession(home, session, deps)).ok ? 0 : 1;
}

function attributeCmd(session: string | undefined, dryRun: boolean): number {
  if (!isSessionId(session)) {
    say(cliMsg("SESSION_REQUIRED"));
    return 1;
  }
  const home = ecHome();
  if (!existsSync(ledgerPath(home, session))) {
    say(cliMsg("NO_LEDGER", { id: session }));
    return 1;
  }
  const { body, packages } = buildUpload(home, session, new Date());
  process.stdout.write(formatTable(packages) + "\n");
  if (dryRun) process.stdout.write(JSON.stringify(body, null, 2) + "\n");
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [cmd, arg] = args.positional;
  switch (cmd) {
    case "init":
      return init(args.flags.global === true);
    case "key":
      return key(arg, flag(args, "api"));
    case "login":
      return runLogin(ecHome(), flag(args, "api"), {
        fetch,
        say,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        hostname,
      });
    case "start":
      runStart(readStdin(), ecHome());
      return 0;
    case "record":
      runRecord(readStdin(), ecHome());
      return 0;
    case "settle":
      return settle(flag(args, "session"));
    case "attribute":
      return attributeCmd(flag(args, "session"), args.flags["dry-run"] === true);
    case "mcp":
      // Serves until Claude Code closes stdin; stdin keeps the process alive.
      await runMcp(ecHome());
      return 0;
    default:
      say(cliMsg("USAGE"));
      return 1;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
