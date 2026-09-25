// endcredits init | key | start | record | settle | attribute (DESIGN §4)
import { homedir } from "node:os";
import path from "node:path";
import { cliMsg } from "../../lib/messages";
import { flag, parseArgs } from "./args";
import { writeConfig } from "./config";
import { readStdin } from "./hook";
import { runInit } from "./init";
import { ecHome } from "./paths";
import { runRecord } from "./record";
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

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [cmd, arg] = args.positional;
  switch (cmd) {
    case "init":
      return init(args.flags.global === true);
    case "key":
      return key(arg, flag(args, "api"));
    case "start":
      runStart(readStdin(), ecHome());
      return 0;
    case "record":
      runRecord(readStdin(), ecHome());
      return 0;
    default:
      say(cliMsg("USAGE"));
      return 1;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
