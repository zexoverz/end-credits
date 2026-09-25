// Where End Credits keeps its local state. `ENDCREDITS_HOME` replaces `~/.endcredits` (tests).
import { homedir } from "node:os";
import path from "node:path";

type Env = Record<string, string | undefined>;

export function ecHome(env: Env = process.env): string {
  return env.ENDCREDITS_HOME || path.join(homedir(), ".endcredits");
}

export const sessionsDir = (home: string) => path.join(home, "sessions");
export const configPath = (home: string) => path.join(home, "config.json");
export const errorsLog = (home: string) => path.join(home, "errors.log");

// Claude Code session ids are uuids; anything else could escape the sessions folder.
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isSessionId = (id: unknown): id is string =>
  typeof id === "string" && SESSION_ID.test(id);

export const ledgerPath = (home: string, id: string) =>
  path.join(sessionsDir(home), `${id}.jsonl`);
export const startPath = (home: string, id: string) =>
  path.join(sessionsDir(home), `${id}.start.json`);
export const donePath = (home: string, id: string) =>
  path.join(sessionsDir(home), `${id}.done.json`);
