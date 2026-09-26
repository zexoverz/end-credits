// Integration: the counterparty risk profile on real Postgres. Skipped without TEST_DATABASE_URL.
import { randomUUID } from "node:crypto";
import { getAddress, keccak256, stringToBytes } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;

const addr = () => `0x${randomUUID().replace(/-/g, "")}${randomUUID().slice(0, 8)}`.toLowerCase();

describe.skipIf(!DB_URL)("risk profile (integration)", () => {
  let riskProfile: typeof import("./profile").riskProfile;
  let db: typeof import("../db/client").db;
  let s: typeof import("../db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    ({ db } = await import("../db/client"));
    s = await import("../db/schema");
    ({ riskProfile } = await import("./profile"));
  });

  async function pkg(name: string) {
    const [row] = await db().insert(s.packages).values({ name, packageKey: keccak256(stringToBytes(name)) }).returning();
    return row;
  }

  async function session() {
    const [owner] = await db().insert(s.owners).values({ displayName: "t", payerAddress: addr() }).returning();
    const [key] = await db()
      .insert(s.agentKeys)
      .values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" })
      .returning();
    const id = randomUUID();
    const [row] = await db()
      .insert(s.sessions)
      .values({ ownerId: owner.id, agentKeyId: key.id, claudeSessionId: id, sessionKey: keccak256(stringToBytes(id)) })
      .returning();
    return row;
  }

  const at = (iso: string) => new Date(iso);

  it("a sanctioned payee shows its traits and a refused count", async () => {
    const bad = addr();
    const p = await pkg(`@endcredits-demo/sanctioned-${randomUUID().slice(0, 6)}`);
    await db().insert(s.payeeObservations).values({
      packageId: p.id,
      address: getAddress(bad),
      source: "drips",
      sourceUrl: "https://github.com/x/y/blob/HEAD/FUNDING.json",
      observedAt: at("2026-09-26T01:00:00Z"),
    });
    const trait = { name: "sanction_address", description: "Address is on the OFAC SDN list", risk: 100 };
    await db().insert(s.screens).values([
      { kind: "address", subject: bad, response: { error: "TIMEOUT" }, status: 0, latencyMs: 8000, fetchedAt: at("2026-09-26T01:00:01Z") },
      { kind: "address", subject: bad, response: { toxicScore: 100, traits: [trait] }, status: 200, latencyMs: 900, fetchedAt: at("2026-09-26T01:00:02Z") },
      { kind: "impersonation", subject: bad, response: { isAddressPoisoned: false, originalAddress: null }, status: 200, latencyMs: 300, fetchedAt: at("2026-09-26T01:00:03Z") },
    ]);
    const reasons = [{ source: "intercepta", code: "REFUSED_TRAIT", text: "Refused. Intercepta: Address is on the OFAC SDN list" }];
    for (const decidedAt of ["2026-09-26T01:01:00Z", "2026-09-26T02:01:00Z"]) {
      const sess = await session();
      await db().insert(s.credits).values({
        sessionId: sess.id,
        packageId: p.id,
        score: 1,
        amountMicro: 250_000n,
        role: "starring",
        payee: getAddress(bad),
        outcome: "refused",
        reasons,
        decidedAt: at(decidedAt),
      });
    }

    const r = await riskProfile(bad);
    expect(r.address).toBe(getAddress(bad));
    expect(r.screens).toEqual({ count: 3, firstAt: "2026-09-26T01:00:01.000Z", lastAt: "2026-09-26T01:00:03.000Z" });
    expect(r.intercepta.address).toEqual({
      toxicScore: 100,
      traits: [trait],
      noHistory: false,
      screenedAt: "2026-09-26T01:00:02.000Z",
    });
    expect(r.intercepta.impersonation).toMatchObject({ isAddressPoisoned: false, originalAddress: null });
    expect(r.intercepta.simulation).toBeNull();
    expect(r.decisions.count).toBe(2);
    expect(r.decisions.sessions).toBe(2);
    expect(r.decisions.byOutcome.refused).toEqual({ count: 2, amount: { micro: "500000", usdc: "0.5" } });
    expect(r.decisions.byOutcome.paid.count).toBe(0);
    expect(r.decisions.last).toMatchObject({ package: p.name, outcome: "refused", decidedAt: "2026-09-26T02:01:00.000Z", reasons });
    expect(r.payeeOf).toMatchObject([{ package: p.name, source: "drips", current: true, changed: false }]);
  });

  it("a changed payout shows both addresses on either side", async () => {
    const a = addr();
    const b = addr();
    const p = await pkg(`@endcredits-demo/moved-${randomUUID().slice(0, 6)}`);
    const obs = (address: string, iso: string) => ({ packageId: p.id, address: getAddress(address), source: "drips", sourceUrl: "u", observedAt: at(iso) });
    await db().insert(s.payeeObservations).values([
      obs(a, "2026-09-25T00:00:00Z"),
      obs(a, "2026-09-25T12:00:00Z"),
      obs(b, "2026-09-26T00:00:00Z"),
    ]);

    const old = await riskProfile(a);
    expect(old.payeeOf).toHaveLength(1);
    expect(old.payeeOf[0]).toMatchObject({
      package: p.name,
      firstObservedAt: "2026-09-25T00:00:00.000Z",
      lastObservedAt: "2026-09-25T12:00:00.000Z",
      current: false,
      changed: true,
    });
    expect(old.payeeOf[0].addresses).toEqual([
      { address: getAddress(a), source: "drips", firstObservedAt: "2026-09-25T00:00:00.000Z", lastObservedAt: "2026-09-25T12:00:00.000Z", current: false },
      { address: getAddress(b), source: "drips", firstObservedAt: "2026-09-26T00:00:00.000Z", lastObservedAt: "2026-09-26T00:00:00.000Z", current: true },
    ]);

    const now = await riskProfile(b);
    expect(now.payeeOf[0]).toMatchObject({ current: true, changed: true });
    expect(now.payeeOf[0].addresses.map((x) => x.address)).toEqual([getAddress(a), getAddress(b)]);
  });

  it("an address we never saw → an empty profile", async () => {
    const r = await riskProfile(addr());
    expect(r).toMatchObject({
      source: "db",
      screens: { count: 0, firstAt: null, lastAt: null },
      intercepta: { address: null, impersonation: null, simulation: null },
      payeeOf: [],
      decisions: { count: 0, sessions: 0, last: null },
    });
  });

  it("a no-history 404 is a verdict, not an error", async () => {
    const fresh = addr();
    const { NO_HISTORY_BODY } = await import("../intercepta/no-history");
    await db().insert(s.screens).values({ kind: "address", subject: fresh, response: NO_HISTORY_BODY, status: 404, latencyMs: 200 });
    expect((await riskProfile(fresh)).intercepta.address).toMatchObject({ toxicScore: 0, traits: [], noHistory: true });
  });
});
