// Integration: the x402 screen-freshness query on real Postgres. Run with TEST_DATABASE_URL set
// (migrated); skipped otherwise.
import { beforeAll, describe, expect, it } from "vitest";
import { NO_HISTORY_BODY } from "../intercepta/no-history";
import type { CreditRepo } from "./server";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("latestAddressScreenAt (integration)", () => {
  let repo: CreditRepo;
  let insert: (subject: string, status: number, response: unknown, at: Date) => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    const { db } = await import("../db/client");
    const { screens } = await import("../db/schema");
    repo = (await import("./repo")).drizzleCreditRepo(db());
    insert = async (subject, status, response, at) => {
      await db().insert(screens).values({ kind: "address", subject, chainId: null, mappedFrom: null, response, status, latencyMs: 1, fetchedAt: at });
    };
  });

  const fresh = () => `0x${crypto.randomUUID().replace(/-/g, "").padEnd(40, "0")}`;
  const t0 = new Date("2026-09-26T10:00:00Z");
  const t1 = new Date("2026-09-26T10:05:00Z");

  it("counts a no-history 404 as a screen", async () => {
    const a = fresh();
    await insert(a, 404, NO_HISTORY_BODY, t0);
    expect(await repo.latestAddressScreenAt(a)).toEqual(t0);
  });

  it("ignores any other 404", async () => {
    const a = fresh();
    await insert(a, 404, { error: "HTTP", detail: "Not Found" }, t0);
    expect(await repo.latestAddressScreenAt(a)).toBeNull();
  });

  it("takes the newer of a 200 and a no-history 404", async () => {
    const a = fresh();
    await insert(a, 200, { toxicScore: 0, traits: [] }, t0);
    await insert(a, 404, NO_HISTORY_BODY, t1);
    expect(await repo.latestAddressScreenAt(a)).toEqual(t1);
    const b = fresh();
    await insert(b, 404, NO_HISTORY_BODY, t0);
    await insert(b, 200, { toxicScore: 0, traits: [] }, t1);
    expect(await repo.latestAddressScreenAt(b)).toEqual(t1);
  });
});

describe.skipIf(!DB_URL)("addScreenId (integration)", () => {
  it("appends the payer screen once", async () => {
    process.env.DATABASE_URL = DB_URL;
    const { db } = await import("../db/client");
    const s = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const repo = (await import("./repo")).drizzleCreditRepo(db());
    const id = crypto.randomUUID();
    const [owner] = await db()
      .insert(s.owners)
      .values({ displayName: "t", payerAddress: "0x01", sessionBudgetMicro: BigInt(1), packageCapMicro: BigInt(1), dailyLimitMicro: BigInt(1), holdTtlSeconds: 60, settleMode: "on_open" })
      .returning();
    const [key] = await db().insert(s.agentKeys).values({ ownerId: owner.id, label: "k", tokenHash: id, boundVia: "dev" }).returning();
    const [session] = await db()
      .insert(s.sessions)
      .values({ ownerId: owner.id, agentKeyId: key.id, claudeSessionId: id, sessionKey: "0x00" })
      .returning();
    const [pkg] = await db().insert(s.packages).values({ name: `payer-${id}`, packageKey: `0x${id}` }).returning();
    const earlier = crypto.randomUUID();
    const [c] = await db()
      .insert(s.credits)
      .values({ sessionId: session.id, packageId: pkg.id, score: 1, amountMicro: BigInt(1), role: "thanks", screenIds: [earlier] })
      .returning();
    const payerScreen = crypto.randomUUID();
    await repo.addScreenId(c.id, payerScreen);
    await repo.addScreenId(c.id, payerScreen);
    const [row] = await db().select().from(s.credits).where(eq(s.credits.id, c.id));
    expect(row.screenIds).toEqual([earlier, payerScreen]);
  });
});
