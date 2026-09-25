// Typed calls into EndCreditsEscrow (DESIGN §16). Payer-signed: hold, reserve, approveEscrow.
// Recorder-signed: release, refund, setClaim, claim, recordSession. Every write goes through the
// per-key tx queue and returns the tx hash; a revert throws TxRevertedError with the custom error
// name (`TipExists`, `NotPending`, ...).
import type { Address, Hash, Hex } from "viem";
import { erc20Abi, escrowAbi } from "./abi";
import { chain, type ChainContext } from "./keys";
import { createTxQueue, viemIo, type TxQueue } from "./txqueue";

export { TxRevertedError } from "./txqueue";

const queues = new WeakMap<ChainContext, TxQueue>();

function queueFor(ctx: ChainContext): TxQueue {
  let q = queues.get(ctx);
  if (!q) {
    q = createTxQueue(viemIo(ctx.publicClient, [ctx.payer, ctx.recorder]));
    queues.set(ctx, q);
  }
  return q;
}

type Signer = "payer" | "recorder";

function writeEscrow(
  ctx: ChainContext,
  signer: Signer,
  functionName: string,
  args: readonly unknown[],
): Promise<Hash> {
  return queueFor(ctx).submit(ctx[signer].account.address, {
    address: ctx.escrow,
    abi: escrowAbi,
    functionName,
    args,
  });
}

export interface HoldArgs {
  tipId: Hex;
  packageKey: Hex;
  payee: Address;
  amount: bigint;
  reason: number;
  ttlSeconds: number;
}

export function hold(a: HoldArgs, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "payer", "hold", [
    a.tipId,
    a.packageKey,
    a.payee,
    a.amount,
    a.reason,
    BigInt(a.ttlSeconds),
  ]);
}

export function release(tipId: Hex, approvalRef: Hex, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "recorder", "release", [tipId, approvalRef]);
}

export function refund(tipId: Hex, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "recorder", "refund", [tipId]);
}

export function reserve(
  packageKey: Hex,
  amount: bigint,
  sessionId: Hex,
  ctx: ChainContext = chain(),
): Promise<Hash> {
  return writeEscrow(ctx, "payer", "reserve", [packageKey, amount, sessionId]);
}

export function setClaim(
  packageKey: Hex,
  payee: Address,
  evidence: Hex,
  ctx: ChainContext = chain(),
): Promise<Hash> {
  return writeEscrow(ctx, "recorder", "setClaim", [packageKey, payee, evidence]);
}

export function claim(packageKey: Hex, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "recorder", "claim", [packageKey]);
}

export interface SessionTotals {
  sessionId: Hex;
  ownerHash: Hex;
  budget: bigint;
  paid: bigint;
  held: bigint;
  reserved: bigint;
  refused: bigint;
  manifestHash: Hex;
}

export function recordSession(s: SessionTotals, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "recorder", "recordSession", [
    s.sessionId,
    s.ownerHash,
    s.budget,
    s.paid,
    s.held,
    s.reserved,
    s.refused,
    s.manifestHash,
  ]);
}

export function approveEscrow(amount: bigint, ctx: ChainContext = chain()): Promise<Hash> {
  return queueFor(ctx).submit(ctx.payer.account.address, {
    address: ctx.usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [ctx.escrow, amount],
  });
}

// Reads

export const TIP_STATUS = ["none", "pending", "released", "refunded"] as const;
export type TipStatus = (typeof TIP_STATUS)[number];

export interface Tip {
  payer: Address;
  payee: Address;
  packageKey: Hex;
  amount: bigint;
  expiresAt: bigint;
  status: TipStatus;
}

export async function tipOf(tipId: Hex, ctx: ChainContext = chain()): Promise<Tip> {
  const t = await ctx.publicClient.readContract({
    address: ctx.escrow,
    abi: escrowAbi,
    functionName: "tipOf",
    args: [tipId],
  });
  return {
    payer: t.payer,
    payee: t.payee,
    packageKey: t.packageKey,
    amount: t.amount,
    expiresAt: BigInt(t.expiresAt),
    status: TIP_STATUS[t.status] ?? "none",
  };
}

export function claimOf(packageKey: Hex, ctx: ChainContext = chain()): Promise<Address> {
  return ctx.publicClient.readContract({
    address: ctx.escrow,
    abi: escrowAbi,
    functionName: "claimOf",
    args: [packageKey],
  });
}

export function reserved(packageKey: Hex, ctx: ChainContext = chain()): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.escrow,
    abi: escrowAbi,
    functionName: "reserved",
    args: [packageKey],
  });
}

export function usdcBalance(account?: Address, ctx: ChainContext = chain()): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account ?? ctx.payer.account.address],
  });
}

/** How much `owner` (default: the payer) lets the escrow pull. */
export function allowance(owner?: Address, ctx: ChainContext = chain()): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner ?? ctx.payer.account.address, ctx.escrow],
  });
}
