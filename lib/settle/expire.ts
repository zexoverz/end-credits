// Expirer (T7.3): pending holds past `expires_at` are refunded to the owner through the escrow
// (recorder key; `refund` is permissionless after expiry anyway), and the credit says EXPIRED. With a
// budget wallet the refund lands on the hot key, so it then goes back to the owner's wallet
// (return.ts); returns that failed, here or on deny or at settlement, are retried every tick.
import { and, eq, lt } from "drizzle-orm";
import { formatUnits, type Hash, type Hex } from "viem";
import { credits, holds } from "../db/schema";
import { msg } from "../messages";
import { pendingHoldReturns, pendingSessionReturns, retryHoldReturn, returnSessionLeftover, type ReturnFn } from "./return";
import { errorLabel } from "./settle";
import { appendReason, type Database } from "./store";

export type ExpireDeps = {
  database: Database;
  refund(tipId: Hex): Promise<Hash>;
  /** Hot key USDC transfer back to the owner's wallet; omitted → nothing is returned. */
  returnToOwner?: ReturnFn;
  now?: () => Date;
  log?: (line: string) => void;
};

export async function expireHolds(deps: ExpireDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const due = await deps.database
    .select({ id: holds.id, tipId: holds.tipId, creditId: holds.creditId, amount: credits.amountMicro })
    .from(holds)
    .innerJoin(credits, eq(credits.id, holds.creditId))
    .where(and(eq(holds.status, "pending"), lt(holds.expiresAt, now)));

  let done = 0;
  for (const h of due) {
    let tx: Hash;
    try {
      tx = await deps.refund(h.tipId as Hex);
    } catch (err) {
      deps.log?.(`expire: hold ${h.id} not refunded: ${errorLabel(err)}`);
      continue;
    }
    await deps.database
      .update(holds)
      .set({ status: "expired", refundTx: tx, resolvedAt: new Date() })
      .where(and(eq(holds.id, h.id), eq(holds.status, "pending")));
    await appendReason(deps.database, h.creditId, {
      source: "policy",
      code: "EXPIRED",
      text: msg("EXPIRED", { amount: formatUnits(h.amount, 6) }),
    });
    if (deps.returnToOwner) {
      await retryHoldReturn(deps.database, h.id, { returnToOwner: deps.returnToOwner, log: deps.log });
    }
    done++;
  }
  return done;
}

/** Sends every return still owed: refunded holds and settlement leftovers of funded sessions. */
export async function retryReturns(deps: ExpireDeps): Promise<number> {
  if (!deps.returnToOwner) return 0;
  const r = { returnToOwner: deps.returnToOwner, log: deps.log };
  let sent = 0;
  for (const id of await pendingHoldReturns(deps.database)) {
    if (await retryHoldReturn(deps.database, id, r)) sent++;
  }
  for (const id of await pendingSessionReturns(deps.database)) {
    if (await returnSessionLeftover(deps.database, id, r)) sent++;
  }
  return sent;
}
