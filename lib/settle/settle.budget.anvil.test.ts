// End to end on anvil (:8549) and Postgres: the owner's USDC stays in the owner's wallet, the owner
// approves it to EndCreditsBudget and gives the hot key an allowance; settleSession pulls exactly the
// session's spend, then reserves it in EndCreditsEscrow from the hot key. The hot key starts with no
// USDC, so the reserve only succeeds if the pull did. Skips without TEST_DATABASE_URL, anvil or
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
import { budgetAbi, erc20Abi } from "../chain/abi";
import { allowanceOf, pull, remaining, usdcAllowanceToBudget, usdcBalance } from "../chain/budget";
import { approveEscrow, recordSession, reserve, reserved } from "../chain/escrow";
import { createChainContext, type ChainContext } from "../chain/keys";
import { TxRevertedError } from "../chain/txqueue";

const DB_URL = process.env.TEST_DATABASE_URL;
const RPC = "http://127.0.0.1:8549";
const OUT = path.resolve(__dirname, "../../contracts/out");
const ANVIL = path.join(homedir(), ".foundry/bin/anvil");
const HOT = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECORDER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OWNER = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const PER_DAY = BigInt(1_000_000);
const MINTED = BigInt(50_000_000);

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
  anvil = spawn(ANVIL, ["--port", "8549", "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await rpcUp()) return true;
  }
  return false;
}

const mockUsdc = artifact("MockUSDC");
const escrowArt = artifact("EndCreditsEscrow");
const budgetArt = artifact("EndCreditsBudget");
const ready = Boolean(DB_URL && mockUsdc && escrowArt && budgetArt) && (await ensureAnvil());

describe.skipIf(!ready)("settleSession with the budget wallet on anvil", () => {
  let ctx: ChainContext;
  let budget: Address;
  const publicClient = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 50 });
  const wallet = (account: typeof HOT) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
  const mined = async (hash: Hash) => publicClient.waitForTransactionReceipt({ hash });

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    const deployer = wallet(HOT);
    const deploy = async (abi: Abi, bytecode: Hex, args: readonly unknown[]) =>
      (await mined(await deployer.deployContract({ abi, bytecode, args }))).contractAddress as Address;
    const usdc = await deploy(mockUsdc!.abi, mockUsdc!.bytecode, []);
    const escrow = await deploy(escrowArt!.abi, escrowArt!.bytecode, [usdc, RECORDER.address, BigInt(3 * 86400)]);
    budget = await deploy(budgetArt!.abi, budgetArt!.bytecode, [usdc]);
    await mined(await deployer.writeContract({ address: usdc, abi: mockUsdc!.abi, functionName: "mint", args: [OWNER.address, MINTED] }));
    ctx = createChainContext({ rpcUrl: RPC, chain: foundry, payer: HOT, recorder: RECORDER, escrow, usdc, pollingInterval: 50 });
    await approveEscrow(BigInt(1_000_000_000), ctx);
  }, 30_000);

  afterAll(() => {
    anvil?.kill();
  });

  it("names the revert: no allowance, then no USDC approval, then over the period cap", async () => {
    await expect(pull(OWNER.address, BigInt(1), ctx, budget)).rejects.toMatchObject({ errorName: "NoAllowance" });
    const owner = wallet(OWNER);
    await mined(await owner.writeContract({ address: budget, abi: budgetAbi, functionName: "setAllowance", args: [HOT.address, PER_DAY, BigInt(86400)] }));
    await expect(pull(OWNER.address, BigInt(1), ctx, budget)).rejects.toMatchObject({ errorName: "ERC20InsufficientAllowance" });
    await mined(await owner.writeContract({ address: ctx.usdc, abi: erc20Abi, functionName: "approve", args: [budget, PER_DAY * BigInt(10)] }));
    const over = pull(OWNER.address, PER_DAY + BigInt(1), ctx, budget);
    await expect(over).rejects.toBeInstanceOf(TxRevertedError);
    await expect(over).rejects.toMatchObject({ errorName: "OverPeriodCap" });
    expect(await remaining(OWNER.address, undefined, ctx, budget)).toBe(PER_DAY);
    expect(await usdcAllowanceToBudget(OWNER.address, ctx, budget)).toBe(PER_DAY * BigInt(10));
    expect(await allowanceOf(OWNER.address, undefined, ctx, budget)).toMatchObject({ perPeriod: PER_DAY, period: BigInt(86400), spentInPeriod: BigInt(0) });
  }, 30_000);

  it("pulls the session's spend from the owner's wallet, then reserves it from the hot key", async () => {
    const { db } = await import("../db/client");
    const s = await import("../db/schema");
    const { settleSession } = await import("./settle");
    const { sessionKeyFor } = await import("../sessions/ingest");
    const { dbObservations } = await import("../payee/observe");
    const database = db();
    const observations = dbObservations(database);

    const [owner] = await database
      .insert(s.owners)
      .values({ displayName: "anvil-budget", payerAddress: HOT.address, budgetOwner: OWNER.address, sessionBudgetMicro: BigInt(500_000) })
      .returning();
    const [key] = await database.insert(s.agentKeys).values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" }).returning();
    const id = randomUUID();
    await database.insert(s.sessions).values({ id, ownerId: owner.id, agentKeyId: key.id, claudeSessionId: randomUUID(), sessionKey: sessionKeyFor(id) });
    const name = `anvil-budget-${id.slice(0, 8)}`;
    await database.insert(s.usage).values([{ sessionId: id, packageName: name, signal: "import", count: 1 }]);

    const ownerBefore = await usdcBalance(OWNER.address, ctx);
    expect(await usdcBalance(HOT.address, ctx)).toBe(BigInt(0));
    const order: string[] = [];

    await settleSession(id, {
      database,
      usdc: ctx.usdc,
      payer: HOT.address,
      observations,
      loadPackage: async (n) => ({
        name: n,
        version: "1.0.0",
        repoFullName: null,
        repoDirectory: null,
        homepage: null,
        funding: null,
        fundingLinks: [],
        createdAt: new Date("2020-01-01"),
        weeklyDownloads: 1_000_000,
      }),
      resolvePayee: async () => ({ address: null }),
      screenPayee: async () => {
        throw new Error("no screen expected");
      },
      escrow: {
        reserve: (k, a, sk) => {
          order.push("reserve");
          return reserve(k, a, sk, ctx);
        },
        hold: async () => {
          throw new Error("no hold expected");
        },
        recordSession: (t) => recordSession(t, ctx),
      },
      payCredit: async () => {
        throw new Error("no payment expected");
      },
      budget: {
        remaining: (o) => remaining(o, undefined, ctx, budget),
        pull: (o, amount) => {
          order.push("pull");
          return pull(o, amount, ctx, budget);
        },
      },
    });

    const [c] = await database
      .select({ c: s.credits, key: s.packages.packageKey })
      .from(s.credits)
      .innerJoin(s.packages, eq(s.packages.id, s.credits.packageId))
      .where(eq(s.credits.sessionId, id));
    expect(c.c.outcome).toBe("reserved");
    expect(c.c.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const amount = c.c.amountMicro;
    expect(amount).toBe(BigInt(250_000));
    expect(order).toEqual(["pull", "reserve"]);

    const [session] = await database.select().from(s.sessions).where(eq(s.sessions.id, id));
    expect(session.status).toBe("settled");
    const receipt = await publicClient.getTransactionReceipt({ hash: session.budgetPullTx as Hash });
    const [pulled] = await publicClient.getContractEvents({
      address: budget,
      abi: budgetAbi,
      eventName: "Pulled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    expect(pulled.args).toMatchObject({ owner: OWNER.address, spender: HOT.address, amount });

    expect(await usdcBalance(OWNER.address, ctx)).toBe(ownerBefore - amount);
    expect(await usdcBalance(HOT.address, ctx)).toBe(BigInt(0));
    expect(await reserved(c.key as Hex, ctx)).toBe(amount);
    expect(await remaining(OWNER.address, undefined, ctx, budget)).toBe(PER_DAY - amount);
  }, 60_000);
});
