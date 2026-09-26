// Drizzle access for the dashboard and the webhook. bytes32 values and tx hashes are stored as
// lowercase 0x hex (viem output), and MultiBaas values are lowercased before they reach here.
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { credits, holds, notifications, owners, packages, sessions, webhookEvents } from "../db/schema";
import type { DashboardRepo } from "./dashboard";
import type { WebhookRepo } from "./webhook";

type Database = ReturnType<typeof db>;
type Queryable = Pick<Database, "select" | "insert">;

export function drizzleDashboardRepo(database: Database = db()): DashboardRepo {
  return {
    async packageNames(keys) {
      const rows = await database
        .select({ key: packages.packageKey, name: packages.name })
        .from(packages)
        .where(inArray(packages.packageKey, keys));
      return new Map(rows.map((r) => [r.key.toLowerCase(), r.name]));
    },

    async creditsByTx(txHashes) {
      return database
        .select({ txHash: credits.txHash, packageKey: packages.packageKey, sessionKey: sessions.sessionKey })
        .from(credits)
        .innerJoin(packages, eq(packages.id, credits.packageId))
        .innerJoin(sessions, eq(sessions.id, credits.sessionId))
        .where(inArray(credits.txHash, txHashes)) as Promise<
        { txHash: string; packageKey: string; sessionKey: string }[]
      >;
    },

    async refusedCount() {
      const [row] = await database.select({ n: count() }).from(credits).where(eq(credits.outcome, "refused"));
      return row?.n ?? 0;
    },

    async holdsByTip(tipIds) {
      const rows = await database
        .select({ tipId: holds.tipId, package: packages.name, payee: credits.payee, reasons: credits.reasons })
        .from(holds)
        .innerJoin(credits, eq(credits.id, holds.creditId))
        .innerJoin(packages, eq(packages.id, credits.packageId))
        .where(inArray(sql`lower(${holds.tipId})`, tipIds.map((t) => t.toLowerCase())));
      return rows.map((r) => ({
        tipId: r.tipId.toLowerCase(),
        package: r.package,
        payee: r.payee,
        reasons: Array.isArray(r.reasons) ? (r.reasons as { text: string }[]) : [],
      }));
    },

    async lastDecisions(keys) {
      const rows = await database
        .select({ packageKey: packages.packageKey, outcome: credits.outcome, decidedAt: credits.decidedAt })
        .from(credits)
        .innerJoin(packages, eq(packages.id, credits.packageId))
        .where(and(inArray(packages.packageKey, keys), isNotNull(credits.decidedAt)))
        .orderBy(desc(credits.decidedAt));
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!latest.has(r.packageKey)) latest.set(r.packageKey, r);
      return [...latest.values()];
    },
  };
}

function webhookRepoOn(q: Queryable, transaction: WebhookRepo["transaction"]): WebhookRepo {
  const repo: WebhookRepo = {
    async insertEvent(e) {
      const rows = await q
        .insert(webhookEvents)
        .values({ eventId: e.eventId, kind: e.kind, payload: e.payload })
        .onConflictDoNothing({ target: webhookEvents.eventId })
        .returning({ id: webhookEvents.id });
      return rows.length > 0;
    },

    async notifyHeld(payer, tipId) {
      const recipients = await q
        .select({ id: owners.id })
        .from(owners)
        .where(sql`lower(${owners.payerAddress}) = ${payer.toLowerCase()}`);
      if (recipients.length === 0) return 0;
      // The settler writes the hold row after the tx is mined, so it may not exist yet.
      const [hold] = await q
        .select({ id: holds.id })
        .from(holds)
        .where(sql`lower(${holds.tipId}) = ${tipId.toLowerCase()}`)
        .limit(1);
      await q
        .insert(notifications)
        .values(recipients.map((o) => ({ ownerId: o.id, kind: "held", holdId: hold?.id ?? null })));
      return recipients.length;
    },

    transaction,
  };
  return repo;
}

export function drizzleWebhookRepo(database: Database = db()): WebhookRepo {
  return webhookRepoOn(database, (fn) =>
    database.transaction((tx) => {
      const inner: WebhookRepo = webhookRepoOn(tx, (f) => f(inner));
      return fn(inner);
    }),
  );
}
