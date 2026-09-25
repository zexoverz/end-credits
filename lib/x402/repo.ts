// Drizzle access for the x402 credit resource. Kept thin so server.ts is tested without a DB.
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "../db/client";
import { credits, packages, screens } from "../db/schema";
import type { Receipt } from "./receipt";
import type { CreditRepo, PayableCredit } from "./server";

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

    async latestAddressScreenAt(address: string): Promise<Date | null> {
      const [row] = await database
        .select({ at: max(screens.fetchedAt) })
        .from(screens)
        .where(
          and(
            eq(screens.kind, "address"),
            eq(screens.status, 200),
            sql`lower(${screens.subject}) = ${address.toLowerCase()}`,
          ),
        );
      return row?.at ?? null;
    },

    async saveSettlement(id: string, tx: string, receipt: Receipt): Promise<void> {
      await database
        .update(credits)
        .set({ txHash: tx, receipt, settledAt: new Date() })
        .where(and(eq(credits.id, id), isNull(credits.txHash)));
    },
  };
}
