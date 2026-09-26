// Integration: `screens` reuse on real Postgres. Run with TEST_DATABASE_URL set (migrated); skipped
// otherwise.
import { beforeAll, describe, expect, it } from "vitest";
import { freshScreen, type ScreenRepo } from "./cache";
import { NO_HISTORY_BODY } from "./no-history";

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)("drizzleScreenRepo (integration)", () => {
  let repo: ScreenRepo;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    const { db } = await import("../db/client");
    repo = (await import("./repo")).drizzleScreenRepo(db());
  });

  const key = () => ({ kind: "address" as const, subject: `0x${crypto.randomUUID().replace(/-/g, "").padEnd(40, "0")}`, chainId: null });

  it("reuses a no-history 404 row", async () => {
    const k = key();
    const id = await repo.insert({ ...k, mappedFrom: null, response: NO_HISTORY_BODY, status: 404, latencyMs: 1 });
    expect((await freshScreen(repo, k, new Date()))?.id).toBe(id);
  });

  it("does not reuse any other 404", async () => {
    const k = key();
    await repo.insert({ ...k, mappedFrom: null, response: { error: "HTTP" }, status: 404, latencyMs: 1 });
    expect(await freshScreen(repo, k, new Date())).toBeNull();
  });
});
