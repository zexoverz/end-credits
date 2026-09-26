// Drizzle access for the x402 credit resource. Kept thin so server.ts is tested without a DB.
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "../db/client";
import { credits, packages, screens } from "../db/schema";
import { isNoHistory } from "../intercepta/no-history";
import type { Receipt } from "./receipt";
import type { CreditRepo, PayableCredit } from "./server";

// How many recent 404 rows to look through for a no-history one.
const NOT_FOUND_SCAN = 10;

export function drizzleCreditRepo(database = db()): CreditRepo {
  return {
    async loadCredit(id: string): Promise<PayableCredit | null> {
      const [row] = await database
        .select({
          id: credits.id,
          packageName: packages.name,
          sessionId: credits.sessionId,
          amountMicro: credits.amountMicro,
          payee: credits.payee,
          outcome: credits.outcome,
          txHash: credits.txHash,
          receipt: credits.receipt,
        })
        .from(credits)
        .innerJoin(packages, eq(packages.id, credits.packageId))
        .where(eq(credits.id, id))
        .limit(1);
      return row ? { ...row, receipt: (row.receipt as Receipt | null) ?? null } : null;
    },

    // A 200, or the no-history 404 (a successful screen, lib/intercepta/no-history.ts).
    async latestAddressScreenAt(address: string): Promise<Date | null> {
      const where = and(eq(screens.kind, "address"), sql`lower(${screens.subject}) = ${address.toLowerCase()}`);
      const [ok] = await database
        .select({ at: max(screens.fetchedAt) })
        .from(screens)
        .where(and(where, eq(screens.status, 200)));
      const notFound = await database
        .select({ at: screens.fetchedAt, status: screens.status, response: screens.response })
        .from(screens)
        .where(and(where, eq(screens.status, 404)))
        .orderBy(desc(screens.fetchedAt))
        .limit(NOT_FOUND_SCAN);
      const noHistory = notFound.find((r) => isNoHistory(r.status, r.response))?.at ?? null;
      const at = ok?.at ?? null;
      if (at === null) return noHistory;
      return noHistory !== null && noHistory > at ? noHistory : at;
    },

    async addScreenId(id: string, screenId: string): Promise<void> {
      await database
        .update(credits)
        .set({ screenIds: sql`array_append(${credits.screenIds}, ${screenId}::uuid)` })
        .where(and(eq(credits.id, id), sql`not (${screenId}::uuid = any(${credits.screenIds}))`));
    },

    async saveSettlement(id: string, tx: string, receipt: Receipt): Promise<void> {
      await database
        .update(credits)
        .set({ txHash: tx, receipt, settledAt: new Date() })
        .where(and(eq(credits.id, id), isNull(credits.txHash)));
    },
  };
}
