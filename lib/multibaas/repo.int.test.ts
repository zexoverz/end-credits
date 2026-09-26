// Integration: the dashboard repo's hold lookup on real Postgres. Skipped without TEST_DATABASE_URL.
import { randomUUID } from "node:crypto";
import { keccak256, stringToBytes } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("dashboard repo holdsByTip (integration)", () => {
  let repo: import("./dashboard").DashboardRepo;
  let db: typeof import("../db/client").db;
  let s: typeof import("../db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    ({ db } = await import("../db/client"));
    s = await import("../db/schema");
    repo = (await import("./repo")).drizzleDashboardRepo(db());
  });

  it("finds a hold by tip id in any case, with package, payee and reasons", async () => {
    const id = randomUUID();
    const name = `@endcredits-demo/held-${id.slice(0, 6)}`;
    const [p] = await db().insert(s.packages).values({ name, packageKey: keccak256(stringToBytes(name)) }).returning();
    const [owner] = await db().insert(s.owners).values({ displayName: "t", payerAddress: "0x0000000000000000000000000000000000000001" }).returning();
    const [key] = await db().insert(s.agentKeys).values({ ownerId: owner.id, label: "k", tokenHash: id, boundVia: "dev" }).returning();
    const [sess] = await db()
      .insert(s.sessions)
      .values({ ownerId: owner.id, agentKeyId: key.id, claudeSessionId: id, sessionKey: keccak256(stringToBytes(id)) })
      .returning();
    const reasons = [{ source: "payee", code: "HELD_CHANGED", text: "Held: changed." }];
    const [c] = await db()
      .insert(s.credits)
      .values({ sessionId: sess.id, packageId: p.id, score: 1, amountMicro: 1n, role: "starring", payee: "0xAbC", outcome: "held", reasons })
      .returning();
    const tipId = keccak256(stringToBytes(`tip-${id}`));
    await db().insert(s.holds).values({ creditId: c.id, tipId, expiresAt: new Date(), holdTx: "0x1" });

    const found = await repo.holdsByTip([tipId.toUpperCase().replace("0X", "0x"), keccak256(stringToBytes("none"))]);
    expect(found).toEqual([{ tipId, package: name, payee: "0xAbC", reasons }]);
  });
});
