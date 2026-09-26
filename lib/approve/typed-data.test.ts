import { concat, encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  approvalRefFor,
  releaseDigestOf,
  releaseTypedData,
  releaseTypedDataJson,
  uuidBytes,
  type ReleaseMessage,
} from "./typed-data";

const ESCROW: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const m: ReleaseMessage = {
  tipId: keccak256(toHex("tip")),
  payee: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  amount: BigInt(150_000),
  approvalRef: keccak256(toHex("ref")),
  deadline: BigInt(1_790_000_000),
};

/** The digest the way the contract builds it (OZ EIP712 + RELEASE_TYPEHASH), by hand. */
function contractDigest(msg: ReleaseMessage, escrow: Address, chainId: number): Hex {
  const domainTypehash = keccak256(
    toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
  );
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [domainTypehash, keccak256(toHex("EndCreditsEscrow")), keccak256(toHex("2")), BigInt(chainId), escrow],
    ),
  );
  const typehash = keccak256(
    toHex("Release(bytes32 tipId,address payee,uint256 amount,bytes32 approvalRef,uint256 deadline)"),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint256" }],
      [typehash, msg.tipId, msg.payee, msg.amount, msg.approvalRef, msg.deadline],
    ),
  );
  return keccak256(concat(["0x1901", domainSeparator, structHash]));
}

describe("release typed data", () => {
  it("hashes to the contract's digest on Base Sepolia", () => {
    expect(releaseDigestOf(m, ESCROW)).toBe(contractDigest(m, ESCROW, 84532));
  });

  it("binds chain, escrow, payee and amount", () => {
    const base = releaseDigestOf(m, ESCROW);
    expect(releaseDigestOf(m, ESCROW, 1)).not.toBe(base);
    expect(releaseDigestOf(m, "0x0000000000000000000000000000000000000001")).not.toBe(base);
    expect(releaseDigestOf({ ...m, amount: BigInt(150_001) }, ESCROW)).not.toBe(base);
    expect(releaseDigestOf({ ...m, payee: ESCROW }, ESCROW)).not.toBe(base);
  });

  it("the JSON form signs to the same digest as the typed form", async () => {
    const account = privateKeyToAccount(`0x${"42".repeat(32)}`);
    const json = releaseTypedDataJson(m, ESCROW);
    expect(json.message).toMatchObject({ amount: "150000", deadline: "1790000000" });
    expect(json.domain).toEqual({ name: "EndCreditsEscrow", version: "2", chainId: 84532, verifyingContract: ESCROW });
    const sig = await account.signTypedData(releaseTypedData(m, ESCROW));
    const { recoverTypedDataAddress } = await import("viem");
    const fromJson = await recoverTypedDataAddress({
      domain: json.domain,
      types: { Release: json.types.Release },
      primaryType: "Release",
      message: { ...json.message, amount: BigInt(json.message.amount), deadline: BigInt(json.message.deadline) },
      signature: sig,
    });
    expect(fromJson).toBe(account.address);
  });

  it("approvalRef is keccak256(abi.encode(tipId, bytes16 uuid))", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(uuidBytes(id)).toBe("0x123e4567e89b12d3a456426614174000");
    expect(approvalRefFor(m.tipId, id)).toBe(
      keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes16" }], [m.tipId, uuidBytes(id)])),
    );
    expect(() => uuidBytes("nope")).toThrow();
  });
});
