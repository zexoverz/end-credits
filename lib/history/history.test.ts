// Integration: real Postgres. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { msg } from "../messages";
import { connect, makeOwner, PAYEE, seedHold, TEST_DB } from "../__fixtures__/owner-db";

type Conn = Awaited<ReturnType<typeof connect>>;

describe.skipIf(!TEST_DB)("history (integration)", () => {
  let history: typeof import("./history");
  let db: Conn["db"];
  let s: Conn["s"];

  beforeAll(async () => {
    ({ db, s } = await connect());
    history = await import("./history");
  });

  it("lists decided credits newest first with screens, reasons and tx links", async () => {
    const ownerId = await makeOwner(db, s);
    const a = await seedHold(db, s, ownerId);
    const b = await seedHold(db, s, ownerId);
    const later = new Date(Date.now() + 10 * 86400_000);
    const latest = new Date(later.getTime() + 1000);
    const [screen] = await db
      .insert(s.screens)
      .values({
        kind: "address",
        subject: PAYEE,
        chainId: 8453,
        mappedFrom: `base-sepolia:${PAYEE}`,
        response: { toxicScore: 3, traits: [] },
        status: 200,
        latencyMs: 412,
      })
      .returning();
    const tx = `0x${"ab".repeat(32)}`;
    const reasons = [
      { source: "policy", code: "PAID", text: msg("PAID", { amount: "0.15" }) },
      { source: "intercepta", code: "SCREENED_AS", text: msg("SCREENED_AS") },
    ];
    await db
      .update(s.credits)
      .set({ decidedAt: later, outcome: "paid", txHash: tx, screenIds: [screen.id], reasons })
      .where(eq(s.credits.id, a.creditId));
    await db.update(s.credits).set({ decidedAt: latest }).where(eq(s.credits.id, b.creditId));
    // Not decided yet: must not appear.
    const [pkg] = await db
      .insert(s.packages)
      .values({ name: `undecided-${randomUUID().slice(0, 8)}`, packageKey: `0x${randomUUID().replace(/-/g, "")}` })
      .returning();
    const [undecided] = await db
      .insert(s.credits)
      .values({ sessionId: a.sessionId, packageId: pkg.id, score: 1, amountMicro: BigInt(10_000), role: "thanks" })
      .returning();

    const items = await history.creditHistory();
    const ids = items.map((i) => i.creditId);
    expect(ids.slice(0, 2)).toEqual([b.creditId, a.creditId]);
    expect(ids).not.toContain(undecided.id);

    const paid = items[1];
    expect(paid).toMatchObject({
      sessionId: a.sessionId,
      package: a.packageName,
      outcome: "paid",
      amount: "0.15",
      payee: "0x1234…5678",
      reasons,
      txHash: tx,
      txUrl: `https://sepolia.basescan.org/tx/${tx}`,
      decidedAt: later.toISOString(),
      hold: { status: "pending", releaseTx: null, refundTx: null },
    });
    expect(paid.screens).toEqual([
      {
        id: screen.id,
        kind: "address",
        status: 200,
        latencyMs: 412,
        mappedFrom: `base-sepolia:${PAYEE}`,
        screenedAs: msg("SCREENED_AS"),
        fetchedAt: screen.fetchedAt.toISOString(),
      },
    ]);
    expect(items[0].screens).toEqual([]);
    expect(items[0].txUrl).toBeNull(); // "0xhold" is not a tx hash
  });

  it("caps the list at 200", async () => {
    const ownerId = await makeOwner(db, s);
    const { sessionId } = await seedHold(db, s, ownerId);
    const pkgs = await db
      .insert(s.packages)
      .values(
        Array.from({ length: 201 }, () => {
          const id = randomUUID();
          return { name: `bulk-${id}`, packageKey: `0x${id.replace(/-/g, "")}` };
        }),
      )
      .returning({ id: s.packages.id });
    await db.insert(s.credits).values(
      pkgs.map((p) => ({
        sessionId,
        packageId: p.id,
        score: 1,
        amountMicro: BigInt(10_000),
        role: "thanks",
        outcome: "dust",
        decidedAt: new Date(),
      })),
    );
    expect(await history.creditHistory()).toHaveLength(200);
    expect(await history.creditHistory(5000)).toHaveLength(200);
  });
});
