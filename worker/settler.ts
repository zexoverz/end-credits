// Settler loop (DESIGN §7): every 2 s, claim one session asking to settle and settle it. The logic
// lives in lib/settle/ so it is tested against Postgres.
import { settleNext } from "../lib/settle/run";
import type { SettleDeps } from "../lib/settle/settle";
import { startLoop, type Loop } from "./loop";

export const SETTLE_INTERVAL_MS = 2_000;

export function startSettler(deps: SettleDeps, log: (line: string) => void = console.error): Loop {
  return startLoop("settler", SETTLE_INTERVAL_MS, () => settleNext({ log, ...deps }), log);
}
