// Integration: settlement against a real Postgres with every outside call injected (registry,
// payee resolution, Intercepta, chain, x402). Fakes live only here. Run with TEST_DATABASE_URL set
// (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Address, Hash, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import { TxRevertedError } from "../chain/txqueue";
import type { Screen } from "../decision/types";
import { msg } from "../messages";
import type { Resolution } from "../payee/resolve";
import type { NpmPackageWithDownloads } from "../registry/npm";

const DB_URL = process.env.TEST_DATABASE_URL;
const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYER: Address = "0x9ebd000000000000000000000000000000000001";

const randomAddress = () => privateKeyToAccount(generatePrivateKey()).address;
const suffix = () => randomUUID().slice(0, 8);

const clean: Screen = { toxicScore: 0, traits: [], tokenAction: "info", tokenDetectors: [], impersonation: null, screenIds: [] };

describe.skipIf(!DB_URL)("settleSession (integration)", () => {
  let mod: typeof import("./settle");
  let run: typeof import("./run");
  let store: typeof import("./store");
  let s: typeof import("../db/schema");
  let database: import("./store").Database;
  let observations: import("../payee/observe").ObservationStore;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    mod = await import("./settle");
    run = await import("./run");
    store = await import("./store");
    s = await import("../db/schema");
    const { db } = await import("../db/client");
    database = db();
    observations = (await import("../payee/observe")).dbObservations(database);
  });

  type Owner = { budget?: bigint; cap?: bigint; daily?: bigint };

  async function seedSession(pkgs: Record<string, Record<string, number>>, o: Owner = {}) {
    const [owner] = await database
      .insert(s.owners)
      .values({
        displayName: "t",
        payerAddress: PAYER,
        sessionBudgetMicro: o.budget ?? BigInt(500_000),
        packageCapMicro: o.cap ?? BigInt(250_000),
        dailyLimitMicro: o.daily ?? BigInt(20_000_000),
        holdTtlSeconds: 3600,
        settleMode: "on_open",
      })
      .returning();
    const [key] = await database
      .insert(s.agentKeys)
      .values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" })
      .returning();
    const id = randomUUID();
    await database.insert(s.sessions).values({
      id,
      ownerId: owner.id,
      agentKeyId: key.id,
      claudeSessionId: randomUUID(),
      sessionKey: `0x${"ab".repeat(32)}`,
      settleRequestedAt: new Date(),
    });
    const rows = Object.entries(pkgs).flatMap(([packageName, signals]) =>
      Object.entries(signals).map(([signal, count]) => ({ sessionId: id, packageName, signal, count })),
    );
    if (rows.length) await database.insert(s.usage).values(rows);
    return { id, ownerId: owner.id };
  }

  const creditRow = async (creditId: string) =>
    (await database.select().from(s.credits).where(eq(s.credits.id, creditId)))[0];

  function fakes(payees: Record<string, Address | null>, screens: Record<string, Screen | "throw">) {
    const calls = { pay: [] as string[], hold: [] as Hex[], reserve: [] as Hex[], resolve: [] as string[], record: 0 };
    const decidedBefore: string[] = [];
    const creditByTip = async (tip: Hex) =>
      (await database.select().from(s.credits).where(eq(s.credits.tipId, tip)))[0];
    const creditByKey = async (sessionKeyAndPkg: { pkgKey: Hex }) => {
      const [p] = await database.select().from(s.packages).where(eq(s.packages.packageKey, sessionKeyAndPkg.pkgKey));
      return (await database.select().from(s.credits).where(eq(s.credits.packageId, p.id)))[0];
    };
    const assertDecided = (row: { outcome: string | null; decidedAt: Date | null } | undefined, what: string) => {
      expect(row?.outcome, `${what}: decision stored before execution`).toBeTruthy();
      expect(row?.decidedAt, `${what}: decided_at stored before execution`).toBeInstanceOf(Date);
      decidedBefore.push(what);
    };
    const deps: import("./settle").SettleDeps = {
      database,
      usdc: USDC,
      payer: PAYER,
      observations,
      loadPackage: async (name): Promise<NpmPackageWithDownloads> => ({
        name,
        version: "1.0.0",
        repoFullName: `o/${name}`,
        repoDirectory: null,
        homepage: null,
        funding: null,
        fundingLinks: [],
        createdAt: new Date("2020-01-01"),
        weeklyDownloads: 1_000_000,
      }),
      resolvePayee: async (pkg): Promise<Resolution> => {
        calls.resolve.push(pkg.name);
        const address = payees[pkg.name] ?? null;
        if (!address) return { address: null };
        await observations.record({ packageId: pkg.id, address, source: "drips", sourceUrl: "x" });
        return { address, source: "drips", sourceUrl: "x" };
      },
      screenPayee: async (payee) => {
        const sc = screens[payee];
        if (sc === "throw") throw new Error("screens insert failed");
        return sc ?? clean;
      },
      escrow: {
        reserve: async (pkgKey, _amount, _sessionKey): Promise<Hash> => {
          assertDecided(await creditByKey({ pkgKey }), "reserve");
          calls.reserve.push(pkgKey);
          return `0x${"01".repeat(32)}`;
        },
        hold: async (a): Promise<Hash> => {
          assertDecided(await creditByTip(a.tipId), "hold");
          calls.hold.push(a.tipId);
          return `0x${"02".repeat(32)}`;
        },
        recordSession: async (): Promise<Hash> => {
          calls.record++;
          return `0x${"03".repeat(32)}`;
        },
      },
      payCredit: async (credit) => {
        assertDecided(await creditRow(credit.id), "pay");
        calls.pay.push(credit.id);
        return { tx: `0x${"04".repeat(32)}`, receipt: { creditId: credit.id } };
      },
    };
    return { deps, calls, decidedBefore };
  }

  it("settles a session into all five outcomes, each decision stored before execution", async () => {
    const n = { paid: `paid-${suffix()}`, capped: `capped-${suffix()}`, held: `held-${suffix()}`, refused: `refused-${suffix()}`, reserved: `reserved-${suffix()}` };
    const a = { paid: randomAddress(), capped: randomAddress(), held: randomAddress(), refused: randomAddress() };
    const { id } = await seedSession({
      [n.capped]: { import: 5, dep_added: 1 }, // 20
      [n.paid]: { import: 1 }, // 3
      [n.held]: { import: 1 },
      [n.refused]: { import: 1 },
      [n.reserved]: { import: 1 },
    });
    const sanctioned: Screen = { ...clean, toxicScore: 100, traits: [{ name: "sanction_address", description: "OFAC SDN" }] };
    const { deps, calls, decidedBefore } = fakes(
      { [n.paid]: a.paid, [n.capped]: a.capped, [n.held]: a.held, [n.refused]: a.refused, [n.reserved]: null },
      { [a.held]: "throw", [a.refused]: sanctioned },
    );

    await mod.settleSession(id, deps);

    const rows = await database
      .select({ name: s.packages.name, c: s.credits })
      .from(s.credits)
      .innerJoin(s.packages, eq(s.packages.id, s.credits.packageId))
      .where(eq(s.credits.sessionId, id));
    const by = Object.fromEntries(rows.map((r) => [r.name, r.c]));
    expect(Object.fromEntries(Object.entries(n).map(([k, name]) => [k, by[name].outcome]))).toEqual({
      paid: "paid",
      capped: "capped",
      held: "held",
      refused: "refused",
      reserved: "reserved",
    });
    expect(by[n.capped].amountMicro).toBe(BigInt(250_000));
    expect(by[n.capped].role).toBe("starring");
    expect(by[n.held].reasons).toEqual([expect.objectContaining({ code: "SCREEN_UNAVAILABLE" })]);
    expect(by[n.refused].reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "REFUSED_TRAIT" })]));

    // refused: never paid, never held
    expect(calls.pay).toEqual(expect.arrayContaining([by[n.paid].id, by[n.capped].id]));
    expect(calls.pay).toHaveLength(2);
    expect(calls.hold).toEqual([by[n.held].tipId]);
    expect(calls.reserve).toHaveLength(1);
    expect(decidedBefore.sort()).toEqual(["hold", "pay", "pay", "reserve"]);
    expect(by[n.refused].txHash).toBeNull();

    const [hold] = await database.select().from(s.holds).where(eq(s.holds.creditId, by[n.held].id));
    expect(hold).toMatchObject({ status: "pending", tipId: by[n.held].tipId, holdTx: `0x${"02".repeat(32)}` });

    const [session] = await database.select().from(s.sessions).where(eq(s.sessions.id, id));
    expect(session.status).toBe("settled");
    expect(session.budgetMicro).toBe(BigInt(500_000));
    expect(session.manifestHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(session.recordTx).toBe(`0x${"03".repeat(32)}`);
    expect(calls.record).toBe(1);
  });

  it("pays nothing past the daily limit: every credit is dust with DAILY_LIMIT", async () => {
    const name = `limited-${suffix()}`;
    const { id, ownerId } = await seedSession({ [name]: { import: 3 } }, { daily: BigInt(1_000_000) });
    // an earlier session today already spent the whole limit
    const [earlier] = await database
      .insert(s.sessions)
      .values({ ownerId, agentKeyId: (await database.select().from(s.agentKeys).where(eq(s.agentKeys.ownerId, ownerId)))[0].id, claudeSessionId: randomUUID(), sessionKey: "0x00", status: "settled" })
      .returning();
    const [p] = await database.insert(s.packages).values({ name: `spent-${suffix()}`, packageKey: `0x${suffix()}` }).returning();
    await database.insert(s.credits).values({ sessionId: earlier.id, packageId: p.id, score: 1, amountMicro: BigInt(1_000_000), role: "thanks", outcome: "paid", decidedAt: new Date() });

    const { deps, calls } = fakes({ [name]: randomAddress() }, {});
    await mod.settleSession(id, deps);

    const [c] = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
    expect(c.outcome).toBe("dust");
    expect(c.amountMicro).toBe(BigInt(0));
    expect(c.reasons).toEqual([expect.objectContaining({ code: "DAILY_LIMIT" })]);
    expect(calls.resolve).toEqual([]);
    expect(calls.pay).toEqual([]);
    const [session] = await database.select().from(s.sessions).where(eq(s.sessions.id, id));
    expect(session.status).toBe("settled");
    expect(session.budgetMicro).toBe(BigInt(0));
  });

  it("marks sub-floor shares dust and never resolves them", async () => {
    const big = `big-${suffix()}`;
    const tiny = `tiny-${suffix()}`;
    const { id } = await seedSession({ [big]: { import: 5, dep_added: 1 }, [tiny]: { read: 1 } }, { budget: BigInt(30_000) });
    const { deps, calls } = fakes({ [big]: randomAddress(), [tiny]: randomAddress() }, {});
    await mod.settleSession(id, deps);
    expect(calls.resolve).toEqual([big]);
    const rows = await database
      .select({ name: s.packages.name, c: s.credits })
      .from(s.credits)
      .innerJoin(s.packages, eq(s.packages.id, s.credits.packageId))
      .where(eq(s.credits.sessionId, id));
    const t = rows.find((r) => r.name === tiny)!.c;
    expect(t.outcome).toBe("dust");
    expect(t.reasons).toEqual([expect.objectContaining({ code: "DUST" })]);
  });

  it("keeps the decision when execution fails and records why", async () => {
    const name = `fails-${suffix()}`;
    const { id } = await seedSession({ [name]: { import: 1 } });
    const { deps } = fakes({ [name]: randomAddress() }, {});
    deps.payCredit = async () => {
      throw new Error("facilitator down");
    };
    await mod.settleSession(id, deps);
    const [c] = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
    expect(c.outcome).toBe("capped");
    expect(c.txHash).toBeNull();
    expect(c.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EXECUTION_FAILED" })]));
  });

  it("a hold without an approver on chain stays held with NO_APPROVER and no hold row", async () => {
    const name = `noapprover-${suffix()}`;
    const payee = randomAddress();
    const { id } = await seedSession({ [name]: { import: 1 } });
    const { deps } = fakes({ [name]: payee }, { [payee]: "throw" });
    deps.escrow.hold = async () => {
      throw new TxRevertedError("hold", "NoApprover");
    };
    await mod.settleSession(id, deps);
    const [c] = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
    expect(c.outcome).toBe("held");
    expect(c.txHash).toBeNull();
    expect(c.reasons).toEqual(
      expect.arrayContaining([{ source: "policy", code: "NO_APPROVER", text: msg("NO_APPROVER") }]),
    );
    expect(await database.select().from(s.holds).where(eq(s.holds.creditId, c.id))).toHaveLength(0);
  });

  it("refuses without paying when the payee lookup fails twice", async () => {
    const name = `lookup-${suffix()}`;
    const { id } = await seedSession({ [name]: { import: 1 } });
    const { deps, calls } = fakes({}, {});
    deps.resolvePayee = async () => {
      throw new Error("GitHub 502");
    };
    await mod.settleSession(id, deps);
    const [c] = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
    expect(c.outcome).toBe("refused");
    expect(c.reasons).toEqual([expect.objectContaining({ code: "RESOLVE_FAILED" })]);
    expect(calls.pay).toEqual([]);
    expect(calls.reserve).toEqual([]);
  });

  // Sessions asked to settle at the epoch sort first, so a single claim takes ours and leaves
  // sessions from other test files alone.
  const EPOCH = new Date(0);

  it("claims the oldest waiting session and skips ones not asked to settle", async () => {
    const unasked = await seedSession({});
    await database.update(s.sessions).set({ settleRequestedAt: null }).where(eq(s.sessions.id, unasked.id));
    const asked = await seedSession({});
    await database.update(s.sessions).set({ settleRequestedAt: EPOCH }).where(eq(s.sessions.id, asked.id));

    expect(await store.claimNextSession(database)).toBe(asked.id);
    const status = async (id: string) =>
      (await database.select().from(s.sessions).where(eq(s.sessions.id, id)))[0].status;
    expect(await status(asked.id)).toBe("settling");
    expect(await status(unasked.id)).toBe("uploaded");
  });

  it("marks the session failed when settlement crashes", async () => {
    const name = `crash-${suffix()}`;
    const { id } = await seedSession({ [name]: { import: 1 } });
    await database.update(s.sessions).set({ settleRequestedAt: EPOCH }).where(eq(s.sessions.id, id));
    const { deps } = fakes({ [name]: randomAddress() }, {});
    deps.escrow.recordSession = async () => {
      throw new Error("rpc down");
    };
    const lines: string[] = [];
    expect(await run.settleNext({ ...deps, log: (l) => lines.push(l) })).toBe(id);
    const [row] = await database.select().from(s.sessions).where(eq(s.sessions.id, id));
    expect(row.status).toBe("failed");
    expect(lines.join("\n")).toContain(id);
  });
});
