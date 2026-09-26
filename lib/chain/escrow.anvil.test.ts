// Integration test against a local anvil on :8546. Uses a running one, or starts
// `~/.foundry/bin/anvil --port 8546` itself; skips when neither works or when `contracts/out` is
// missing (run `cd contracts && forge build` first). Keys are anvil's public dev keys.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  concat,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  http,
  keccak256,
  serializeErc6492Signature,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  allowance,
  approverOf,
  approverState,
  approveEscrow,
  deployErc6492Wallet,
  claim,
  claimOf,
  hold,
  recordSession,
  refund,
  release,
  releaseDigest,
  reserve,
  reserved,
  setApprover,
  setClaim,
  tipOf,
  TxRevertedError,
  usdcBalance,
} from "./escrow";
import { releaseDigestOf, releaseTypedData, type ReleaseMessage } from "../approve/typed-data";
import { escrowAbi } from "./abi";
import { createChainContext, type ChainContext } from "./keys";

const RPC = "http://127.0.0.1:8546";
const OUT = path.resolve(__dirname, "../../contracts/out");
const ANVIL = path.join(homedir(), ".foundry/bin/anvil");

const PAYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECORDER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const PAYEE: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const PAYEE_2: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
// Signs releases; never sends a tx, so it needs no ETH.
const APPROVER = privateKeyToAccount(`0x${"42".repeat(32)}`);
// A second payer for the counterfactual-wallet case (its approver is a not-yet-deployed contract).
const PAYER_2 = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
// Anvil predeploys the deterministic CREATE2 deployer: calldata is salt ++ initcode.
const CREATE2_DEPLOYER: Address = "0x4e59b44847b379578588920ca78fbf26c0b4956c";

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
  anvil = spawn(ANVIL, ["--port", "8546", "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await rpcUp()) return true;
  }
  return false;
}

const mockUsdc = artifact("MockUSDC");
const escrowArt = artifact("EndCreditsEscrow");
const walletArt = artifact("Mock1271Wallet");
const ready = Boolean(mockUsdc && escrowArt && walletArt) && (await ensureAnvil());

const id = (s: string) => keccak256(toHex(s));
const USDC = (n: number) => BigInt(n) * BigInt(1_000_000);

describe.skipIf(!ready)("escrow on anvil", () => {
  let ctx: ChainContext;
  let ctx2: ChainContext;
  const run = Date.now().toString();

  /** Hold a tip and sign its release with `signer` (default the approver EOA). */
  async function heldAndSigned(tipId: Hex, payee: Address, amount: bigint, c: ChainContext = ctx) {
    await hold({ tipId, packageKey: id("npm:a"), payee, amount, reason: 1, ttlSeconds: 3600 }, c);
    const now = (await c.publicClient.getBlock()).timestamp;
    const m: ReleaseMessage = { tipId, payee, amount, approvalRef: id(`ref-${tipId}`), deadline: now + BigInt(600) };
    const signature = await APPROVER.signTypedData(releaseTypedData(m, c.escrow, foundry.id));
    return { m, signature };
  }

  beforeAll(async () => {
    const publicClient = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 50 });
    const deployer = createWalletClient({ account: PAYER, chain: foundry, transport: http(RPC) });
    const deploy = async (abi: Abi, bytecode: Hex, args: readonly unknown[]) => {
      const hash = await deployer.deployContract({ abi, bytecode, args });
      const r = await publicClient.waitForTransactionReceipt({ hash });
      return r.contractAddress as Address;
    };
    const usdc = await deploy(mockUsdc!.abi, mockUsdc!.bytecode, []);
    const escrow = await deploy(escrowArt!.abi, escrowArt!.bytecode, [usdc, RECORDER.address, BigInt(3 * 86400)]);
    for (const to of [PAYER.address, PAYER_2.address]) {
      const mint = await deployer.writeContract({
        address: usdc,
        abi: mockUsdc!.abi,
        functionName: "mint",
        args: [to, USDC(100)],
      });
      await publicClient.waitForTransactionReceipt({ hash: mint });
    }

    const params = { rpcUrl: RPC, chain: foundry, recorder: RECORDER, escrow, usdc, pollingInterval: 50 };
    ctx = createChainContext({ ...params, payer: PAYER });
    ctx2 = createChainContext({ ...params, payer: PAYER_2 });
    await approveEscrow(USDC(1000), ctx);
    await approveEscrow(USDC(1000), ctx2);
  }, 30_000);

  afterAll(() => {
    anvil?.kill();
  });

  it("approves the escrow for the payer", async () => {
    expect(await allowance(undefined, ctx)).toBe(USDC(1000));
    expect(await usdcBalance(undefined, ctx)).toBe(USDC(100));
  });

  it("hold reverts NoApprover before the payer names one, then setApprover takes effect at once", async () => {
    const tipId = id(`tip-noapprover-${run}`);
    const args = { tipId, packageKey: id("npm:a"), payee: PAYEE, amount: USDC(1), reason: 1, ttlSeconds: 3600 };
    const err = await hold(args, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(TxRevertedError);
    expect(err.errorName).toBe("NoApprover");

    await setApprover(APPROVER.address, ctx);
    expect(await approverOf(undefined, ctx)).toBe(APPROVER.address);
    expect(await approverState(undefined, ctx)).toEqual({
      current: APPROVER.address,
      pending: "0x0000000000000000000000000000000000000000",
      activeAt: BigInt(0),
    });
  });

  it("the typed data digest equals the contract's releaseDigest", async () => {
    const { m } = await heldAndSigned(id(`tip-digest-${run}`), PAYEE, USDC(1));
    const onchain = await releaseDigest(m.tipId, m.approvalRef, m.deadline, ctx);
    expect(releaseDigestOf(m, ctx.escrow, foundry.id)).toBe(onchain);
  });

  it("hold then a signed release pays the fixed payee", async () => {
    const tipId = id(`tip-release-${run}`);
    const { m, signature } = await heldAndSigned(tipId, PAYEE, USDC(2));
    expect((await tipOf(tipId, ctx)).status).toBe("pending");

    const bad = await release({ ...m, signature: await RECORDER.signTypedData(releaseTypedData(m, ctx.escrow, foundry.id)) }, ctx).catch((e) => e);
    expect(bad.errorName).toBe("BadApproval");

    await release({ ...m, signature }, ctx);
    const tip = await tipOf(tipId, ctx);
    expect(tip.status).toBe("released");
    expect(tip.payee).toBe(PAYEE);
    expect(await usdcBalance(PAYEE, ctx)).toBe(USDC(2));
  });

  it("hold then refund returns the money to the payer", async () => {
    const tipId = id(`tip-refund-${run}`);
    const before = await usdcBalance(undefined, ctx);
    await hold({ tipId, packageKey: id("npm:b"), payee: PAYEE_2, amount: USDC(3), reason: 2, ttlSeconds: 3600 }, ctx);
    expect(await usdcBalance(undefined, ctx)).toBe(before - USDC(3));

    await refund(tipId, ctx);
    expect((await tipOf(tipId, ctx)).status).toBe("refunded");
    expect(await usdcBalance(undefined, ctx)).toBe(before);
  });

  it("reserve then setClaim then claim pays the claimed payee", async () => {
    const pkg = id(`npm:unclaimed-${run}`);
    await reserve(pkg, USDC(1), id("session-1"), ctx);
    await reserve(pkg, USDC(1), id("session-2"), ctx);
    expect(await reserved(pkg, ctx)).toBe(USDC(2));

    await setClaim(pkg, PAYEE_2, id("evidence"), ctx);
    expect(await claimOf(pkg, ctx)).toBe(PAYEE_2);

    const before = await usdcBalance(PAYEE_2, ctx);
    await claim(pkg, ctx);
    expect(await reserved(pkg, ctx)).toBe(BigInt(0));
    expect(await usdcBalance(PAYEE_2, ctx)).toBe(before + USDC(2));
  });

  it("recordSession emits SessionSettled", async () => {
    const sessionId = id(`session-${run}`);
    const hash = await recordSession(
      {
        sessionId,
        ownerHash: id("owner"),
        budget: USDC(2),
        paid: USDC(1),
        held: BigInt(0),
        reserved: USDC(1),
        refused: BigInt(0),
        manifestHash: id("manifest"),
      },
      ctx,
    );
    const receipt = await ctx.publicClient.getTransactionReceipt({ hash });
    const logs = await ctx.publicClient.getContractEvents({
      address: ctx.escrow,
      abi: escrowAbi,
      eventName: "SessionSettled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].args.sessionId).toBe(sessionId);
  });

  it("names the custom error on a revert", async () => {
    const tipId = id(`tip-dup-${run}`);
    const args = { tipId, packageKey: id("npm:c"), payee: PAYEE, amount: USDC(1), reason: 1, ttlSeconds: 3600 };
    await hold(args, ctx);
    const err = await hold(args, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(TxRevertedError);
    expect(err.errorName).toBe("TipExists");

    const notPending = await release(
      { tipId: id(`never-held-${run}`), approvalRef: id("x"), deadline: BigInt(0), signature: "0x" },
      ctx,
    ).catch((e) => e);
    expect(notPending.errorName).toBe("NotPending");
  });

  it("a counterfactual approver: 6492 signature deploys the wallet, then the inner signature releases", async () => {
    const salt = id(`salt-${run}`);
    const initCode = concat([walletArt!.bytecode, `0x${APPROVER.address.slice(2).toLowerCase().padStart(64, "0")}`]);
    const wallet = getContractAddress({ opcode: "CREATE2", from: CREATE2_DEPLOYER, salt, bytecode: initCode });
    expect(await ctx2.publicClient.getCode({ address: wallet })).toBeUndefined();
    await setApprover(wallet, ctx2);

    const tipId = id(`tip-6492-${run}`);
    const { m, signature: inner } = await heldAndSigned(tipId, PAYEE_2, USDC(1), ctx2);
    const wrapped = serializeErc6492Signature({ address: CREATE2_DEPLOYER, data: concat([salt, initCode]), signature: inner });
    // Off-chain check accepts the wrapped form before the wallet exists (what the signature API does).
    expect(
      await ctx2.publicClient.verifyTypedData({ address: wallet, ...releaseTypedData(m, ctx2.escrow, foundry.id), signature: wrapped }),
    ).toBe(true);
    // The contract does not read 6492: the wrapped form reverts.
    expect((await release({ ...m, signature: wrapped }, ctx2).catch((e) => e)).errorName).toBe("BadApproval");

    const sig = await deployErc6492Wallet(wallet, wrapped, ctx2);
    expect(sig).toBe(inner);
    expect(await ctx2.publicClient.getCode({ address: wallet })).toMatch(/^0x.+/);
    // Already deployed: unwraps without sending anything.
    expect(await deployErc6492Wallet(wallet, wrapped, ctx2)).toBe(inner);
    expect(await deployErc6492Wallet(wallet, inner, ctx2)).toBe(inner);

    const before = await usdcBalance(PAYEE_2, ctx2);
    await release({ ...m, signature: sig }, ctx2);
    expect((await tipOf(tipId, ctx2)).status).toBe("released");
    expect(await usdcBalance(PAYEE_2, ctx2)).toBe(before + USDC(1));
  });

  it("runs concurrent writes from one key in order", async () => {
    const pkg = id(`npm:burst-${run}`);
    await Promise.all([1, 2, 3, 4].map((n) => reserve(pkg, USDC(n), id(`s-${n}`), ctx)));
    expect(await reserved(pkg, ctx)).toBe(USDC(10));
  });
});
