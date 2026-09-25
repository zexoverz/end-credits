// Integration: the expirer against a real Postgres with the chain injected. Run with
// TEST_DATABASE_URL set (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Hash, Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;
const REFUND_TX: Hash = `0x${"0e".repeat(32)}`;

describe.skipIf(!DB_URL)("expireHolds (integration)", () => {
  let expire: typeof import("./expire");
  let s: typeof import("../db/schema");
  let database: import("./store").Database;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    expire = await import("./expire");
    s = await import("../db/schema");
    database = (await import("../db/client")).db();
  });

  async function seedHold(expiresAt: Date, status = "pending") {
    const [owner] = await database
      .insert(s.owners)
      .values({ displayName: "t", payerAddress: "0x0000000000000000000000000000000000000001" })
      .returning();
    const [key] = await database
      .insert(s.agentKeys)
      .values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" })
      .returning();
    const [session] = await database
      .insert(s.sessions)
      .values({ ownerId: owner.id, agentKeyId: key.id, claudeSessionId: randomUUID(), sessionKey: "0x00", status: "settled" })
      .returning();
    const [pkg] = await database
      .insert(s.packages)
      .values({ name: `held-${randomUUID().slice(0, 8)}`, packageKey: `0x${randomUUID()}` })
      .returning();
    const tip = `0x${randomUUID().replace(/-/g, "").padEnd(64, "0")}` as Hex;
    const [credit] = await database
      .insert(s.credits)
      .values({
        sessionId: session.id,
        packageId: pkg.id,
        score: 3,
        amountMicro: BigInt(120_000),
        role: "thanks",
        outcome: "held",
        reasons: [{ source: "intercepta", code: "HELD_MEDIUM", text: "x" }],
        tipId: tip,
        decidedAt: new Date(),
      })
      .returning();
    const [hold] = await database
      .insert(s.holds)
      .values({ creditId: credit.id, tipId: tip, expiresAt, status, holdTx: "0xhold" })
      .returning();
    return { tip, creditId: credit.id, holdId: hold.id };
  }

  const holdRow = async (id: string) => (await database.select().from(s.holds).where(eq(s.holds.id, id)))[0];
  const creditRow = async (id: string) => (await database.select().from(s.credits).where(eq(s.credits.id, id)))[0];

  it("refunds a pending hold past its expiry and says so on the credit", async () => {
    const h = await seedHold(new Date(Date.now() - 1000));
    const refunded: Hex[] = [];
    await expire.expireHolds({ database, refund: async (tip) => (refunded.push(tip), REFUND_TX) });

    expect(refunded).toContain(h.tip);
    expect(await holdRow(h.holdId)).toMatchObject({ status: "expired", refundTx: REFUND_TX });
    expect((await holdRow(h.holdId)).resolvedAt).toBeInstanceOf(Date);
    const credit = await creditRow(h.creditId);
    expect(credit.outcome).toBe("held");
    expect(credit.reasons).toEqual([
      expect.objectContaining({ code: "HELD_MEDIUM" }),
      { source: "policy", code: "EXPIRED", text: "Not approved in time. 0.12 USDC returned to the owner." },
    ]);
  });

  it("leaves holds that have not expired, or are no longer pending", async () => {
    const future = await seedHold(new Date(Date.now() + 60_000));
    const released = await seedHold(new Date(Date.now() - 1000), "released");
    const refunded: Hex[] = [];
    await expire.expireHolds({ database, refund: async (tip) => (refunded.push(tip), REFUND_TX) });
    expect(refunded).not.toContain(future.tip);
    expect(refunded).not.toContain(released.tip);
    expect((await holdRow(future.holdId)).status).toBe("pending");
    expect((await holdRow(released.holdId)).status).toBe("released");
  });

  it("keeps the hold pending when the refund fails, so the next tick retries", async () => {
    const h = await seedHold(new Date(Date.now() - 1000));
    const lines: string[] = [];
    await expire.expireHolds({
      database,
      refund: async (tip) => {
        if (tip === h.tip) throw new Error("rpc down");
        return REFUND_TX;
      },
      log: (l) => lines.push(l),
    });
    expect((await holdRow(h.holdId)).status).toBe("pending");
    expect((await creditRow(h.creditId)).reasons).toHaveLength(1);
    expect(lines.join("\n")).toContain(h.holdId);
  });
});
