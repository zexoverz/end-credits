// End to end on anvil (:8547) and Postgres: settleSession with the real escrow calls through the tx
// queue. Registry, payee lookup, Intercepta and x402 are injected (x402 needs the public
// facilitator, which cannot settle on anvil). Skips without TEST_DATABASE_URL, anvil or
// `contracts/out` (run `cd contracts && forge build`). Keys are anvil's public dev keys.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escrowAbi } from "../chain/abi";
import { approveEscrow, hold, recordSession, reserve, reserved, setApprover, tipOf } from "../chain/escrow";
import { createChainContext, type ChainContext } from "../chain/keys";
import type { Screen } from "../decision/types";

const DB_URL = process.env.TEST_DATABASE_URL;
const RPC = "http://127.0.0.1:8547";
const OUT = path.resolve(__dirname, "../../contracts/out");
const ANVIL = path.join(homedir(), ".foundry/bin/anvil");
const PAYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECORDER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const HELD_PAYEE: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
// Escrow v2: hold needs the payer to have named an approver.
const APPROVER = privateKeyToAccount(`0x${"42".repeat(32)}`);

function artifact(name: string): { abi: Abi; bytecode: Hex } | undefined {
  const file = path.join(OUT, `${name}.sol/${name}.json`);
  if (!existsSync(file)) return undefined;
  const json = JSON.parse(readFileSync(file, "utf8"));
  return { abi: json.abi, bytecode: json.bytecode.object };
}

async function rpcUp(): Promise<boolean> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let anvil: ChildProcess | undefined;
async function ensureAnvil(): Promise<boolean> {
  if (await rpcUp()) return true;
  if (!existsSync(ANVIL)) return false;
  anvil = spawn(ANVIL, ["--port", "8547", "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await rpcUp()) return true;
  }
  return false;
}

const mockUsdc = artifact("MockUSDC");
const escrowArt = artifact("EndCreditsEscrow");
const ready = Boolean(DB_URL && mockUsdc && escrowArt) && (await ensureAnvil());

describe.skipIf(!ready)("settleSession on anvil", () => {
  let ctx: ChainContext;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    const publicClient = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 50 });
    const deployer = createWalletClient({ account: PAYER, chain: foundry, transport: http(RPC) });
    const deploy = async (abi: Abi, bytecode: Hex, args: readonly unknown[]) => {
      const hash = await deployer.deployContract({ abi, bytecode, args });
      return (await publicClient.waitForTransactionReceipt({ hash })).contractAddress as Address;
    };
    const usdc = await deploy(mockUsdc!.abi, mockUsdc!.bytecode, []);
    const escrow = await deploy(escrowArt!.abi, escrowArt!.bytecode, [usdc, RECORDER.address, BigInt(3 * 86400)]);
    const mint = await deployer.writeContract({
      address: usdc,
      abi: mockUsdc!.abi,
      functionName: "mint",
      args: [PAYER.address, BigInt(100_000_000)],
    });
    await publicClient.waitForTransactionReceipt({ hash: mint });
    ctx = createChainContext({ rpcUrl: RPC, chain: foundry, payer: PAYER, recorder: RECORDER, escrow, usdc, pollingInterval: 50 });
    await approveEscrow(BigInt(1_000_000_000), ctx);
    await setApprover(APPROVER.address, ctx);
  }, 30_000);

  afterAll(() => {
    anvil?.kill();
  });

  it("holds, reserves and records the session on chain", async () => {
    const { db } = await import("../db/client");
    const s = await import("../db/schema");
    const { settleSession } = await import("./settle");
    const { sessionKeyFor } = await import("../sessions/ingest");
    const { dbObservations } = await import("../payee/observe");
    const database = db();
    const observations = dbObservations(database);

    const [owner] = await database
      .insert(s.owners)
      .values({ displayName: "anvil", payerAddress: PAYER.address, sessionBudgetMicro: BigInt(500_000), holdTtlSeconds: 3600 })
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
      sessionKey: sessionKeyFor(id),
    });
    const heldName = `anvil-held-${id.slice(0, 8)}`;
    const reservedName = `anvil-reserved-${id.slice(0, 8)}`;
    await database.insert(s.usage).values([
      { sessionId: id, packageName: heldName, signal: "import", count: 1 },
      { sessionId: id, packageName: reservedName, signal: "import", count: 1 },
    ]);

    const medium: Screen = { toxicScore: 30, traits: [], tokenAction: "info", tokenDetectors: [], impersonation: null, screenIds: [] };
    await settleSession(id, {
      database,
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payer: PAYER.address,
      observations,
      loadPackage: async (name) => ({
        name,
        version: "1.0.0",
        repoFullName: null,
        repoDirectory: null,
        homepage: null,
        funding: null,
        fundingLinks: [],
        createdAt: new Date("2020-01-01"),
        weeklyDownloads: 1_000_000,
      }),
      resolvePayee: async (pkg) => {
        if (pkg.name !== heldName) return { address: null };
        await observations.record({ packageId: pkg.id, address: HELD_PAYEE, source: "drips", sourceUrl: "x" });
        return { address: HELD_PAYEE, source: "drips", sourceUrl: "x" };
      },
      screenPayee: async () => medium,
      escrow: {
        reserve: (k, a, sk) => reserve(k, a, sk, ctx),
        hold: (a) => hold(a, ctx),
        recordSession: (t) => recordSession(t, ctx),
      },
      payCredit: async (): Promise<{ tx: Hash; receipt: unknown }> => {
        throw new Error("no payment expected");
      },
    });

    const rows = await database
      .select({ name: s.packages.name, packageKey: s.packages.packageKey, c: s.credits })
      .from(s.credits)
      .innerJoin(s.packages, eq(s.packages.id, s.credits.packageId))
      .where(eq(s.credits.sessionId, id));
    const held = rows.find((r) => r.name === heldName)!;
    const res = rows.find((r) => r.name === reservedName)!;
    expect(held.c.outcome).toBe("held");
    expect(res.c.outcome).toBe("reserved");

    const tip = await tipOf(held.c.tipId as Hex, ctx);
    expect(tip).toMatchObject({ status: "pending", payee: HELD_PAYEE, amount: held.c.amountMicro });
    expect(await reserved(res.packageKey as Hex, ctx)).toBe(res.c.amountMicro);

    const [session] = await database.select().from(s.sessions).where(eq(s.sessions.id, id));
    expect(session.status).toBe("settled");
    const receipt = await ctx.publicClient.getTransactionReceipt({ hash: session.recordTx as Hash });
    const [event] = await ctx.publicClient.getContractEvents({
      address: ctx.escrow,
      abi: escrowAbi,
      eventName: "SessionSettled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    expect(event.args).toMatchObject({
      sessionId: session.sessionKey,
      manifestHash: session.manifestHash,
      held: held.c.amountMicro,
      reservedAmount: res.c.amountMicro,
      paid: BigInt(0),
    });
  }, 60_000);
});
