// Getting a new owner's payer key ready (multi-owner, decisions.md): gas from the master key, the
// owner's sign-in wallet named as its escrow approver (the first set is immediate), and USDC approved
// to the escrow so holds can move. Idempotent: every step reads first and only sends what is missing.
import { isNull, not } from "drizzle-orm";
import { getAddress, maxUint256, parseEther, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import { db } from "../db/client";
import { owners } from "../db/schema";

export const GAS_FLOOR = parseEther("0.0002");
export const GAS_TOP_UP = parseEther("0.0005");
/** Below this escrow allowance the payer approves again (USDC, 6 decimals). */
export const ESCROW_FLOOR = parseUnits("1000000", 6);

export type ProvisionOwner = { id: string; payerAddress: string; walletAddress: string | null };

export interface ProvisionDeps {
  /** The master payer address; its owner was set up by the seed. */
  master: Address;
  ethBalance(address: Address): Promise<bigint>;
  /** Master key sends `amount` wei to `to`. */
  fundGas(to: Address, amount: bigint): Promise<Hash>;
  approverOf(payer: Address): Promise<Address>;
  /** As the owner's payer key. */
  setApprover(owner: ProvisionOwner, approver: Address): Promise<Hash>;
  escrowAllowance(payer: Address): Promise<bigint>;
  /** As the owner's payer key. */
  approveEscrow(owner: ProvisionOwner, amount: bigint): Promise<Hash>;
  log?(line: string): void;
}

/** True when the owner's payer is ready to hold and pay; false when it has no wallet yet. */
export async function provisionOwner(owner: ProvisionOwner, deps: ProvisionDeps): Promise<boolean> {
  const payer = getAddress(owner.payerAddress);
  if (payer === getAddress(deps.master)) return true;
  if (!owner.walletAddress) return false;
  if ((await deps.ethBalance(payer)) < GAS_FLOOR) {
    const tx = await deps.fundGas(payer, GAS_TOP_UP);
    deps.log?.(`provision: gas for ${payer}: ${tx}`);
  }
  if ((await deps.approverOf(payer)) === zeroAddress) {
    const tx = await deps.setApprover(owner, getAddress(owner.walletAddress));
    deps.log?.(`provision: approver for ${payer}: ${tx}`);
  }
  if ((await deps.escrowAllowance(payer)) < ESCROW_FLOOR) {
    const tx = await deps.approveEscrow(owner, maxUint256);
    deps.log?.(`provision: escrow approval for ${payer}: ${tx}`);
  }
  return true;
}

/** One pass over every owner with a wallet not yet ready; `ready` remembers the ones done. */
export async function provisionAll(deps: ProvisionDeps, ready: Set<string>): Promise<void> {
  const rows = await db()
    .select({ id: owners.id, payerAddress: owners.payerAddress, walletAddress: owners.walletAddress })
    .from(owners)
    .where(not(isNull(owners.walletAddress)));
  for (const row of rows) {
    if (ready.has(row.id)) continue;
    try {
      if (await provisionOwner(row, deps)) ready.add(row.id);
    } catch (err) {
      deps.log?.(`provision: owner ${row.id} not ready: ${err instanceof Error ? err.name : "error"}`);
    }
  }
}
