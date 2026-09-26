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
