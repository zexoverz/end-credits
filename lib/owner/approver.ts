// The owner's approver wallet (escrow v2): the key that must sign every release of a held tip. The
// payer names it on chain with `setApprover`; the first set is immediate, a change waits the escrow's
// `changeDelay` and is shown as pending with its `activeAt`, never hidden.
import { eq } from "drizzle-orm";
import { zeroAddress, type Address, type Hex } from "viem";
import type { ApproverState } from "../chain/escrow";
import { chainCode } from "../approve/actions";
import { db } from "../db/client";
import { owners } from "../db/schema";
import { ownerRow } from "./settings";

export interface ApproverChain {
  /** The address our payer key signs from; `setApprover` only works for that payer. */
  payer(): Address;
  approverOf(payer: Address): Promise<Address>;
  approverState(payer: Address): Promise<ApproverState>;
  setApprover(approver: Address): Promise<Hex>;
}

export interface ApproverView {
  /** As stored for the owner: what prepare hands the wallet and what signatures are checked against. */
  approver: string | null;
  /** In force on chain now (`approverOf`), null when none. */
  onchain: string | null;
  /** A change waiting for the delay: from `activeAt` on it replaces `onchain`. */
  pending: { address: string; activeAt: string } | null;
}

type Problem = { error: "not_found"; status: 404 } | { error: "payer_mismatch"; status: 409 };
type ChainProblem = { error: "chain_error"; status: 502; code: string };

const same = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

async function onchainView(payer: Address, chain: ApproverChain, now: Date) {
  const [onchain, state] = await Promise.all([chain.approverOf(payer), chain.approverState(payer)]);
  const due = state.activeAt * BigInt(1000) <= BigInt(now.getTime());
  const pending =
    state.pending !== zeroAddress && !due
      ? { address: state.pending, activeAt: new Date(Number(state.activeAt) * 1000).toISOString() }
      : null;
  return { onchain: onchain === zeroAddress ? null : onchain, pending };
}

export async function getApprover(
  ownerId: string,
  chain: ApproverChain,
  now: Date = new Date(),
): Promise<ApproverView | Problem | ChainProblem> {
  const row = await ownerRow(ownerId);
  if (!row) return { error: "not_found", status: 404 };
  try {
    const view = await onchainView(row.payerAddress as Address, chain, now);
    return { approver: row.approverAddress, ...view };
  } catch (e) {
    return { error: "chain_error", status: 502, code: chainCode(e) };
  }
}

/**
 * Names `address` as the approver on chain (payer-signed) unless it already is the one in force or
 * the one pending (re-sending a pending change would restart its delay), then stores it.
 */
export async function setOwnerApprover(
  ownerId: string,
  address: Address,
  chain: ApproverChain,
  now: Date = new Date(),
): Promise<(ApproverView & { tx: Hex | null }) | Problem | ChainProblem> {
  const row = await ownerRow(ownerId);
  if (!row) return { error: "not_found", status: 404 };
  const payer = row.payerAddress as Address;
  if (!same(chain.payer(), payer)) return { error: "payer_mismatch", status: 409 };
  let tx: Hex | null = null;
  try {
    const before = await onchainView(payer, chain, now);
    if (!same(before.onchain, address) && !same(before.pending?.address, address)) {
      tx = await chain.setApprover(address);
    }
    const after = await onchainView(payer, chain, now);
    await db().update(owners).set({ approverAddress: address }).where(eq(owners.id, ownerId));
    return { approver: address, ...after, tx };
  } catch (e) {
    return { error: "chain_error", status: 502, code: chainCode(e) };
  }
}
