// Expirer loop (T7.3): every 30 s, refund pending holds past their expiry, then send every return
// to an owner's budget wallet still owed (refunded tips, settlement leftovers).
import { returnToOwner } from "../lib/chain/budget";
import { refund } from "../lib/chain/escrow";
import type { ChainContext } from "../lib/chain/keys";
import { expireHolds, retryReturns } from "../lib/settle/expire";
import type { Database } from "../lib/settle/store";
import type { Address, Hex } from "viem";
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
    async () => {
      const deps = {
        database,
        refund: (tipId: Hex) => refund(tipId, ctx),
        returnToOwner: (owner: Address, amount: bigint) => returnToOwner(owner, amount, ctx),
        log,
      };
      await retryReturns(deps);
      await expireHolds(deps);
    },
    log,
  );
}
