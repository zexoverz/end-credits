import { zeroAddress, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { ESCROW_FLOOR, GAS_FLOOR, GAS_TOP_UP, provisionOwner, type ProvisionDeps } from "./provision";

const MASTER = privateKeyToAccount(`0x${"11".repeat(32)}`).address;
const PAYER = privateKeyToAccount(`0x${"22".repeat(32)}`).address;
const WALLET = privateKeyToAccount(`0x${"33".repeat(32)}`).address;
const owner = { id: "o1", payerAddress: PAYER, walletAddress: WALLET };

function fake(state: { eth: bigint; approver: Address; allowance: bigint }) {
  const sent: string[] = [];
  const deps: ProvisionDeps = {
    master: MASTER,
    ethBalance: async () => state.eth,
    fundGas: async (to, amount) => (sent.push(`gas ${to} ${amount}`), "0x01" as Hash),
    approverOf: async () => state.approver,
    setApprover: async (_o, a) => (sent.push(`approver ${a}`), "0x02" as Hash),
    escrowAllowance: async () => state.allowance,
    approveEscrow: async () => (sent.push("approve"), "0x03" as Hash),
  };
  return { deps, sent };
}

describe("provisioning a new owner's payer", () => {
  it("tops up gas, names the sign-in wallet as approver and approves the escrow", async () => {
    const { deps, sent } = fake({ eth: BigInt(0), approver: zeroAddress, allowance: BigInt(0) });
    expect(await provisionOwner(owner, deps)).toBe(true);
    expect(sent).toEqual([`gas ${PAYER} ${GAS_TOP_UP}`, `approver ${WALLET}`, "approve"]);
  });

  it("sends nothing when the payer is already ready", async () => {
    const { deps, sent } = fake({ eth: GAS_FLOOR, approver: WALLET, allowance: ESCROW_FLOOR });
    expect(await provisionOwner(owner, deps)).toBe(true);
    expect(sent).toEqual([]);
  });

  it("never replaces an approver already set", async () => {
    const other = privateKeyToAccount(`0x${"44".repeat(32)}`).address;
    const { deps, sent } = fake({ eth: GAS_FLOOR, approver: other, allowance: ESCROW_FLOOR });
    await provisionOwner(owner, deps);
    expect(sent).toEqual([]);
  });

  it("leaves the master payer to the seed, and waits for an owner without a wallet", async () => {
    const { deps, sent } = fake({ eth: BigInt(0), approver: zeroAddress, allowance: BigInt(0) });
    expect(await provisionOwner({ ...owner, payerAddress: MASTER }, deps)).toBe(true);
    expect(await provisionOwner({ ...owner, walletAddress: null }, deps)).toBe(false);
    expect(sent).toEqual([]);
  });
});
