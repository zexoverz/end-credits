// Integration: ingest stores the declared repository on the package row. Run with
// TEST_DATABASE_URL set (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("ingestSession declared repository (integration)", () => {
  let ingest: typeof import("./ingest");
  let db: typeof import("@/lib/db/client").db;
  let s: typeof import("@/lib/db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    ingest = await import("./ingest");
    ({ db } = await import("@/lib/db/client"));
    s = await import("@/lib/db/schema");
  });

  async function key() {
    const [owner] = await db()
      .insert(s.owners)
      .values({ displayName: "t", payerAddress: "0x0000000000000000000000000000000000000001", settleMode: "on_open" })
      .returning();
    const [k] = await db()
      .insert(s.agentKeys)
      .values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" })
      .returning();
    return { ownerId: owner.id, agentKeyId: k.id, settleMode: "on_open" } as const;
  }

  const upload = (name: string, extra: Record<string, unknown>) => ({
    claudeSessionId: randomUUID(),
    packages: [{ name, signals: { import: { count: 1 } }, ...extra }],
  });

  const row = async (name: string) => (await db().select().from(s.packages).where(eq(s.packages.name, name)))[0];

  it("stores the first declared repo, directory and homepage, and never overwrites it", async () => {
    const name = `@endcredits-demo/declared-${randomUUID().slice(0, 8)}`;
    const k = await key();
    await ingest.ingestSession(
      k,
      upload(name, {
        repository: { url: "git+https://github.com/Zexoverz/endcredits-fixture-moved-payout.git", directory: "pkg" },
        homepage: "https://example.dev",
      }),
    );
    expect(await row(name)).toMatchObject({
      declaredRepo: "zexoverz/endcredits-fixture-moved-payout",
      declaredDirectory: "pkg",
      declaredHomepage: "https://example.dev",
      repoSource: null,
    });

    await ingest.ingestSession(k, upload(name, { repository: "github:attacker/other" }));
    expect((await row(name)).declaredRepo).toBe("zexoverz/endcredits-fixture-moved-payout");
  });

  it("creates no package row when nothing is declared", async () => {
    const name = `plain-${randomUUID().slice(0, 8)}`;
    await ingest.ingestSession(await key(), upload(name, {}));
    expect(await row(name)).toBeUndefined();
  });
});
