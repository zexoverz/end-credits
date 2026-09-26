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
import { packageKey } from "../payee/keys";
import type { Resolution } from "../payee/resolve";
import type { NpmPackageWithDownloads } from "../registry/npm";

const DB_URL = process.env.TEST_DATABASE_URL;
const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYER: Address = "0x9ebd000000000000000000000000000000000001";

const randomAddress = () => privateKeyToAccount(generatePrivateKey()).address;
const suffix = () => randomUUID().slice(0, 8);

const SIM_SCREEN = "00000000-0000-4000-8000-00000000517a";

// Intercepta's answer for a clean transfer of exactly `amount` Base USDC (live shape, decisions.md).
function exactSimulation(amount: bigint, detectors: { code: string; description: string }[] = []) {
  const usdc = (Number(amount) / 1e6).toString();
  const send = [{ symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", type: "ERC20", amount: usdc }];
  return { ok: true as const, data: { detectors, assetsMovement: { send, receive: [] } }, screenId: SIM_SCREEN };
}

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

  type Owner = { budget?: bigint; cap?: bigint; daily?: bigint; budgetOwner?: Address };

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
        budgetOwner: o.budgetOwner ?? null,
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
    const calls = { pay: [] as string[], hold: [] as Hex[], reserve: [] as Hex[], resolve: [] as string[], record: 0, simulate: [] as string[], reasonsAtPay: [] as string[][], order: [] as string[] };
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
      simulatePayment: async (payee, amount) => {
        calls.simulate.push(payee);
        return exactSimulation(amount);
      },
      escrow: {
        reserve: async (pkgKey, _amount, _sessionKey): Promise<Hash> => {
          assertDecided(await creditByKey({ pkgKey }), "reserve");
          calls.reserve.push(pkgKey);
          calls.order.push("reserve");
          return `0x${"01".repeat(32)}`;
        },
        hold: async (a): Promise<Hash> => {
          assertDecided(await creditByTip(a.tipId), "hold");
          calls.hold.push(a.tipId);
          calls.order.push("hold");
          return `0x${"02".repeat(32)}`;
        },
        recordSession: async (): Promise<Hash> => {
          calls.record++;
          return `0x${"03".repeat(32)}`;
        },
      },
      payCredit: async (credit) => {
        const row = await creditRow(credit.id);
        assertDecided(row, "pay");
        calls.reasonsAtPay.push((row.reasons as { code: string }[]).map((r) => r.code));
        calls.pay.push(credit.id);
        calls.order.push("pay");
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

  describe("a package not on the npm registry", () => {
    const REPO = "zexoverz/endcredits-fixture-moved-payout";
    const RAW = `https://raw.githubusercontent.com/${REPO}/HEAD`;

    // The real resolver against a fake GitHub: package.json names `publishes`, FUNDING.json names `payee`.
    async function declaredSetup(opts: { publishes?: string; registryStatus?: number; declare?: boolean } = {}) {
      const name = `@endcredits-demo/declared-${suffix()}`;
      const payee = randomAddress();
      if (opts.declare !== false) {
        await database.insert(s.packages).values({ name, packageKey: packageKey(name), declaredRepo: REPO });
      }
      const { id } = await seedSession({ [name]: { import: 1 } });
      const { deps, calls } = fakes({}, {});
      const files: Record<string, string> = {
        [`${RAW}/package.json`]: JSON.stringify({ name: opts.publishes ?? name }),
        [`${RAW}/FUNDING.json`]: JSON.stringify({ drips: { ethereum: { ownedBy: payee } } }),
      };
      const fakeFetch = (async (url: string) =>
        files[url] ? new Response(files[url]) : new Response("Not Found", { status: 404 })) as typeof fetch;
      const { RegistryNotFound } = await import("../registry/npm");
      const { resolvePayee } = await import("../payee/resolve");
      deps.loadPackage = async (n) => {
        if (opts.registryStatus && opts.registryStatus !== 404) throw new Error(`npm registry ${opts.registryStatus} for ${n}`);
        throw new RegistryNotFound(n);
      };
      deps.resolvePayee = (pkg) => resolvePayee(pkg, { store: observations, fetch: fakeFetch, claimOf: async () => null });
      await mod.settleSession(id, deps);
      const [row] = await database
        .select({ c: s.credits, p: s.packages })
        .from(s.credits)
        .innerJoin(s.packages, eq(s.packages.id, s.credits.packageId))
        .where(eq(s.credits.sessionId, id));
      return { ...row, payee, calls };
    }

    it("falls back to the declared repo on a 404 and resolves the payee from FUNDING.json", async () => {
      const { c, p, payee, calls } = await declaredSetup();
      expect(c.payee).toBe(payee);
      expect(c.payeeSource).toBe("drips");
      expect(c.outcome).toBe("capped");
      expect(calls.pay).toEqual([c.id]);
      expect(c.reasons).toEqual(expect.arrayContaining([{ source: "payee", code: "REPO_DECLARED", text: msg("REPO_DECLARED") }]));
      expect(p).toMatchObject({ repoFullName: REPO, repoSource: "declared", weeklyDownloads: null, firstPublishedAt: null });
    });

    it("still reserves with SPOOF_REPO when the declared repo publishes another name", async () => {
      const { c, calls } = await declaredSetup({ publishes: "someone-else" });
      expect(c.payee).toBeNull();
      expect(c.outcome).toBe("reserved");
      expect(c.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SPOOF_REPO" })]));
      expect(calls.pay).toEqual([]);
    });

    it("refuses on a registry error other than 404, declared repo or not", async () => {
      const { c, calls } = await declaredSetup({ registryStatus: 503 });
      expect(c.outcome).toBe("refused");
      expect(c.reasons).toEqual([expect.objectContaining({ code: "RESOLVE_FAILED" })]);
      expect(calls.resolve).toEqual([]);
    });

    it("refuses on a 404 when nothing was declared", async () => {
      const { c } = await declaredSetup({ declare: false });
      expect(c.outcome).toBe("refused");
      expect(c.reasons).toEqual([expect.objectContaining({ code: "RESOLVE_FAILED" })]);
    });
  });

  describe("the payment simulation", () => {
    async function simulated(sim: (amount: bigint) => Promise<unknown>) {
      const name = `sim-${suffix()}`;
      const payee = randomAddress();
      const { id } = await seedSession({ [name]: { import: 1 } });
      const { deps, calls } = fakes({ [name]: payee }, {});
      deps.simulatePayment = (_payee, amount) => sim(amount) as ReturnType<NonNullable<import("./settle").SettleDeps["simulatePayment"]>>;
      await mod.settleSession(id, deps);
      const [c] = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
      return { c, calls, payee };
    }

    it("is skipped when the simulation is off (the default), and the credit is still paid", async () => {
      const name = `nosim-${suffix()}`;
      const { id } = await seedSession({ [name]: { import: 1 } });
      const { deps, calls } = fakes({ [name]: randomAddress() }, {});
      delete deps.simulatePayment;
      await mod.settleSession(id, deps);
      const [c] = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
      expect(c.outcome === "paid" || c.outcome === "capped").toBe(true);
      expect((c.reasons as { code: string }[]).map((r) => r.code)).not.toContain("SIMULATED");
      expect(calls.pay.length).toBe(1);
    });

    it("refuses on a malicious detector and never signs", async () => {
      const { c, calls } = await simulated(async (amount) =>
        exactSimulation(amount, [{ code: "MALICIOUS_ADDRESS", description: "Malicious address" }]),
      );
      expect(c.outcome).toBe("refused");
      expect(c.reasons).toEqual(
        expect.arrayContaining([{ source: "intercepta", code: "REFUSED_SIMULATION", text: msg("REFUSED_SIMULATION", { description: "Malicious address" }) }]),
      );
      expect(calls.pay).toEqual([]);
      expect(calls.hold).toEqual([]);
      expect(c.screenIds).toContain(SIM_SCREEN);
    });

    it("holds when the simulated payment moves the wrong amount", async () => {
      const { c, calls, payee } = await simulated(async () => exactSimulation(BigInt(1)));
      expect(c.outcome).toBe("held");
      expect(c.reasons).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "HELD_SIMULATION", text: msg("HELD_SIMULATION", { moved: "-0.000001 USDC", amount: "0.25", payee }) })]),
      );
      expect(calls.pay).toEqual([]);
      expect(calls.hold).toEqual([c.tipId]);
    });

    it("holds as SCREEN_UNAVAILABLE when the simulation errors or throws", async () => {
      const failures = [
        async () => ({ ok: false, error: "TIMEOUT" }),
        async () => {
          throw new Error("boom");
        },
      ];
      for (const sim of failures) {
        const { c, calls } = await simulated(sim);
        expect(c.outcome).toBe("held");
        expect(c.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SCREEN_UNAVAILABLE" })]));
        expect(calls.pay).toEqual([]);
      }
    });

    it("pays a clean exact simulation with SIMULATED stored before the signature", async () => {
      const { c, calls, payee } = await simulated(async (amount) => exactSimulation(amount));
      expect(c.outcome).toBe("capped");
      expect(calls.pay).toEqual([c.id]);
      expect(c.reasons).toEqual(expect.arrayContaining([{ source: "intercepta", code: "SIMULATED", text: msg("SIMULATED", { amount: "0.25", payee }) }]));
      expect(calls.reasonsAtPay).toEqual([expect.arrayContaining(["CAPPED", "SIMULATED"])]);
      expect(c.screenIds).toContain(SIM_SCREEN);
    });

    it("simulates only credits about to be paid", async () => {
      const name = `nosim-${suffix()}`;
      const payee = randomAddress();
      const { id } = await seedSession({ [name]: { import: 1 } });
      const { deps, calls } = fakes({ [name]: payee }, { [payee]: "throw" });
      await mod.settleSession(id, deps);
      expect(calls.simulate).toEqual([]);
    });
  });
  describe("the budget wallet (EndCreditsBudget)", () => {
    const PULL_TX = `0x${"05".repeat(32)}` as Hash;
    const sanctioned: Screen = { ...clean, toxicScore: 100, traits: [{ name: "sanction_address", description: "OFAC SDN" }] };

    // Four credits: paid (capped), held, reserved move money; refused does not.
    const RETURN_TX = `0x${"06".repeat(32)}` as Hash;
    type FourWay = {
      remaining?: bigint;
      pull?: (owner: Address, amount: bigint) => Promise<Hash>;
      budgetOwner?: Address | null;
      payFails?: boolean;
      returnFails?: boolean;
    };
    async function fourWay(o: FourWay = {}) {
      const n = { paid: `bp-${suffix()}`, held: `bh-${suffix()}`, reserved: `br-${suffix()}`, refused: `bx-${suffix()}` };
      const a = { paid: randomAddress(), held: randomAddress(), refused: randomAddress() };
      const budgetOwner = o.budgetOwner === null ? undefined : (o.budgetOwner ?? randomAddress());
      const { id } = await seedSession(
        { [n.paid]: { import: 1 }, [n.held]: { import: 1 }, [n.reserved]: { import: 1 }, [n.refused]: { import: 1 } },
        { budget: BigInt(1_000_000), cap: BigInt(250_000), budgetOwner },
      );
      const { deps, calls } = fakes(
        { [n.paid]: a.paid, [n.held]: a.held, [n.refused]: a.refused, [n.reserved]: null },
        { [a.held]: "throw", [a.refused]: sanctioned },
      );
      if (o.payFails) {
        deps.payCredit = async () => {
          calls.order.push("pay");
          throw new Error("facilitator down");
        };
      }
      const pulls: [Address, bigint][] = [];
      const returned: [Address, bigint][] = [];
      const remainingAsked: Address[] = [];
      const undecidedAtPull: string[] = [];
      deps.budget = {
        remaining: async (owner) => {
          remainingAsked.push(owner);
          return o.remaining ?? BigInt(100_000_000);
        },
        pull: async (owner, amount) => {
          calls.order.push("pull");
          const rows = await database.select().from(s.credits).where(eq(s.credits.sessionId, id));
          undecidedAtPull.push(...rows.filter((r) => !r.outcome || !r.decidedAt).map((r) => r.id));
          pulls.push([owner, amount]);
          return (o.pull ?? (async () => PULL_TX))(owner, amount);
        },
        returnToOwner: async (owner, amount) => {
          calls.order.push("return");
          if (o.returnFails) throw new Error("rpc down");
          returned.push([owner, amount]);
          return RETURN_TX;
        },
      };
      await mod.settleSession(id, deps);
      const rows = await database
        .select({ name: s.packages.name, c: s.credits })
        .from(s.credits)
        .innerJoin(s.packages, eq(s.packages.id, s.credits.packageId))
        .where(eq(s.credits.sessionId, id));
      const by = Object.fromEntries(Object.entries(n).map(([k, name]) => [k, rows.find((r) => r.name === name)!.c]));
      const [session] = await database.select().from(s.sessions).where(eq(s.sessions.id, id));
      return { by, calls, pulls, returned, remainingAsked, undecidedAtPull, session, budgetOwner };
    }

    it("pulls exactly what will move, once, after every decision and before any payment", async () => {
      const { by, calls, pulls, undecidedAtPull, session, budgetOwner } = await fourWay();
      expect(Object.fromEntries(Object.entries(by).map(([k, c]) => [k, c.outcome]))).toEqual({
        paid: "paid",
        held: "held",
        reserved: "reserved",
        refused: "refused",
      });
      const need = by.paid.amountMicro + by.held.amountMicro + by.reserved.amountMicro;
      expect(pulls).toEqual([[budgetOwner, need]]);
      expect(undecidedAtPull).toEqual([]);
      expect(calls.order[0]).toBe("pull");
      expect([...calls.order].sort()).toEqual(["hold", "pay", "pull", "reserve"]);
      expect(session.budgetPullTx).toBe(PULL_TX);
      expect(session.status).toBe("settled");
    });

    it("returns nothing when everything pulled moved", async () => {
      const { returned, session } = await fourWay();
      expect(returned).toEqual([]);
      expect(session.leftoverMicro).toBe(BigInt(0));
      expect(session.returnTx).toBeNull();
    });

    it("returns exactly the share of a failed payment to the owner's wallet, after execution", async () => {
      const { by, calls, pulls, returned, session, budgetOwner } = await fourWay({ payFails: true });
      expect(by.paid.txHash).toBeNull();
      const need = by.paid.amountMicro + by.held.amountMicro + by.reserved.amountMicro;
      expect(pulls).toEqual([[budgetOwner, need]]);
      expect(returned).toEqual([[budgetOwner, by.paid.amountMicro]]);
      expect(calls.order.at(-1)).toBe("return");
      expect(session.leftoverMicro).toBe(by.paid.amountMicro);
      expect(session.returnTx).toBe(RETURN_TX);
      expect(session.status).toBe("settled");
    });

    it("records the leftover for the expirer when the return fails", async () => {
      const { by, session } = await fourWay({ payFails: true, returnFails: true });
      expect(session.status).toBe("settled");
      expect(session.leftoverMicro).toBe(by.paid.amountMicro);
      expect(session.returnTx).toBeNull();
    });

    it("returns nothing when the pull reverted", async () => {
      const { returned, session } = await fourWay({
        payFails: true,
        pull: async () => {
          throw new TxRevertedError("pull", "OverPeriodCap");
        },
      });
      expect(returned).toEqual([]);
      expect(session.leftoverMicro).toBeNull();
    });

    it("moves nothing when the pull reverts, keeps the decisions and says why", async () => {
      const { by, calls, session } = await fourWay({
        pull: async () => {
          throw new TxRevertedError("pull", "OverPeriodCap");
        },
      });
      expect(calls.order).toEqual(["pull"]);
      expect(calls.pay).toEqual([]);
      expect(calls.hold).toEqual([]);
      expect(calls.reserve).toEqual([]);
      const failed = { source: "policy", code: "BUDGET_PULL_FAILED", text: msg("BUDGET_PULL_FAILED", { error: "OverPeriodCap" }) };
      for (const k of ["paid", "held", "reserved"]) {
        expect(by[k].reasons, k).toEqual(expect.arrayContaining([failed]));
        expect(by[k].txHash, k).toBeNull();
      }
      expect(by.paid.outcome).toBe("paid");
      expect(by.held.outcome).toBe("held");
      expect(by.reserved.outcome).toBe("reserved");
      expect((by.refused.reasons as { code: string }[]).map((r) => r.code)).not.toContain("BUDGET_PULL_FAILED");
      expect(await database.select().from(s.holds).where(eq(s.holds.creditId, by.held.id))).toHaveLength(0);
      expect(session.status).toBe("settled");
      expect(session.budgetPullTx).toBeNull();
    });

    it("plans no more than the on-chain remaining allowance", async () => {
      const { by, pulls, session } = await fourWay({ remaining: BigInt(300_000) });
      expect(session.budgetMicro).toBe(BigInt(300_000));
      const total = Object.values(by).reduce((a, c) => a + c.amountMicro, BigInt(0));
      expect(total).toBeLessThanOrEqual(BigInt(300_000));
      expect(pulls).toHaveLength(1);
      expect(pulls[0][1]).toBeLessThanOrEqual(BigInt(300_000));
    });

    it("sends nothing with BUDGET_CAP when the allowance has nothing left", async () => {
      const { by, calls, pulls, session } = await fourWay({ remaining: BigInt(0) });
      expect(pulls).toEqual([]);
      expect(calls.order).toEqual([]);
      for (const c of Object.values(by)) {
        expect(c.outcome).toBe("dust");
        expect(c.reasons).toEqual([expect.objectContaining({ code: "BUDGET_CAP" })]);
      }
      expect(session.budgetMicro).toBe(BigInt(0));
    });

    it("keeps the old path when the owner has no budget wallet", async () => {
      const { calls, pulls, remainingAsked, session } = await fourWay({ budgetOwner: null });
      expect(pulls).toEqual([]);
      expect(remainingAsked).toEqual([]);
      expect([...calls.order].sort()).toEqual(["hold", "pay", "reserve"]);
      expect(session.budgetPullTx).toBeNull();
      expect(session.budgetMicro).toBe(BigInt(1_000_000));
    });
  });
});
