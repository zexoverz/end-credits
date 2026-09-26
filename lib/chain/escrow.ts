// Typed calls into EndCreditsEscrow (DESIGN §16). Payer-signed: hold, reserve, approveEscrow,
// setApprover. Recorder-signed: release, refund, setClaim, claim, recordSession, and the ERC-6492
// wallet deploy. Every write goes through the per-key tx queue and returns the tx hash; a revert
// throws TxRevertedError with the custom error name (`TipExists`, `NotPending`, ...).
import { isErc6492Signature, parseErc6492Signature, type Address, type Hash, type Hex } from "viem";
import { erc20Abi, escrowAbi } from "./abi";
import { chain, type ChainContext, type SignerClient } from "./keys";
import { createTxQueue, viemIo, type TxQueue } from "./txqueue";

export { TxRevertedError } from "./txqueue";

const queues = new WeakMap<object, { queue: TxQueue; signers: Map<string, SignerClient> }>();

/**
 * The one tx queue per public client, shared by every contract and every context on it: the
 * recorder and each owner's payer key keep one nonce sequence each, whichever context sends.
 */
export function queueFor(ctx: ChainContext): TxQueue {
  let q = queues.get(ctx.publicClient);
  if (!q) {
    const signers = new Map<string, SignerClient>();
    q = { queue: createTxQueue(viemIo(ctx.publicClient, signers)), signers };
    queues.set(ctx.publicClient, q);
  }
  for (const s of [ctx.payer, ctx.recorder]) q.signers.set(s.account.address.toLowerCase(), s);
  return q.queue;
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

export interface ReleaseArgs {
  tipId: Hex;
  approvalRef: Hex;
  /** Unix seconds; the signature is valid up to and including this second. */
  deadline: bigint;
  /** The approver's EIP-712 signature, already unwrapped from any ERC-6492 envelope. */
  signature: Hex;
}

export function release(a: ReleaseArgs, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "recorder", "release", [a.tipId, a.approvalRef, a.deadline, a.signature]);
}

/** Payer names its approver. The first set is immediate; a change waits `changeDelay`. */
export function setApprover(approver: Address, ctx: ChainContext = chain()): Promise<Hash> {
  return writeEscrow(ctx, "payer", "setApprover", [approver]);
}

/**
 * The signature `release` can check. A counterfactual smart wallet (Base Account) signs with an
 * ERC-6492 envelope the contract does not read: deploy the wallet through its factory first (from
 * the recorder, permissionless), then pass the inner signature. Anything else comes back unchanged.
 */
export async function deployErc6492Wallet(
  approver: Address,
  signature: Hex,
  ctx: ChainContext = chain(),
): Promise<Hex> {
  if (!isErc6492Signature(signature)) return signature;
  const parsed = parseErc6492Signature(signature);
  if (!parsed.address || !parsed.data) return parsed.signature;
  const code = await ctx.publicClient.getCode({ address: approver });
  if (!code || code === "0x") {
    await queueFor(ctx).submit(ctx.recorder.account.address, {
      to: parsed.address,
      data: parsed.data,
      functionName: "deployErc6492Wallet",
    });
  }
  return parsed.signature;
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

/** The approver in force for `payer` (default: our payer) now; the zero address when none. */
export function approverOf(payer?: Address, ctx: ChainContext = chain()): Promise<Address> {
  return ctx.publicClient.readContract({
    address: ctx.escrow,
    abi: escrowAbi,
    functionName: "approverOf",
    args: [payer ?? ctx.payer.account.address],
  });
}

export interface ApproverState {
  current: Address;
  pending: Address;
  /** Unix seconds the pending approver takes over; 0 when none is pending. */
  activeAt: bigint;
}

/** The stored approver slot as is, pending change included and not promoted. */
export async function approverState(payer?: Address, ctx: ChainContext = chain()): Promise<ApproverState> {
  const [current, pending, activeAt] = await ctx.publicClient.readContract({
    address: ctx.escrow,
    abi: escrowAbi,
    functionName: "approvers",
    args: [payer ?? ctx.payer.account.address],
  });
  return { current, pending, activeAt: BigInt(activeAt) };
}

export function releaseDigest(
  tipId: Hex,
  approvalRef: Hex,
  deadline: bigint,
  ctx: ChainContext = chain(),
): Promise<Hex> {
  return ctx.publicClient.readContract({
    address: ctx.escrow,
    abi: escrowAbi,
    functionName: "releaseDigest",
    args: [tipId, approvalRef, deadline],
  });
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
