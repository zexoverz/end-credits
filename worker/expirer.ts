// Expirer loop (T7.3): every 30 s, refund pending holds past their expiry.
import { refund } from "../lib/chain/escrow";
import type { ChainContext } from "../lib/chain/keys";
import { expireHolds } from "../lib/settle/expire";
import type { Database } from "../lib/settle/store";
import { startLoop, type Loop } from "./loop";

export const EXPIRE_INTERVAL_MS = 30_000;

export function startExpirer(
  database: Database,
  ctx: ChainContext,
  log: (line: string) => void = console.error,
): Loop {
  return startLoop(
    "expirer",
    EXPIRE_INTERVAL_MS,
    () => expireHolds({ database, refund: (tipId) => refund(tipId, ctx), log }),
    log,
  );
}
