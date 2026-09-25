// Expirer (T7.3): pending holds past `expires_at` are refunded to the owner through the escrow
// (recorder key; `refund` is permissionless after expiry anyway), and the credit says EXPIRED.
import { and, eq, lt } from "drizzle-orm";
import { formatUnits, type Hash, type Hex } from "viem";
import { credits, holds } from "../db/schema";
import { msg } from "../messages";
import { errorLabel } from "./settle";
import { appendReason, type Database } from "./store";

export type ExpireDeps = {
  database: Database;
  refund(tipId: Hex): Promise<Hash>;
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
    done++;
  }
  return done;
}
