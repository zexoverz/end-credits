// EIP-712 typed data the owner's approver wallet signs to release one held tip (escrow v2,
// decisions.md "Escrow v2"). It must hash to the contract's `releaseDigest(tipId, approvalRef,
// deadline)`: same domain, and `payee` and `amount` exactly as stored at hold time.
import { encodeAbiParameters, hashTypedData, keccak256, type Address, type Hex } from "viem";

export const ESCROW_DOMAIN_NAME = "EndCreditsEscrow";
export const ESCROW_DOMAIN_VERSION = "2";
export const BASE_SEPOLIA_ID = 84532;

export const RELEASE_TYPES = {
  Release: [
    { name: "tipId", type: "bytes32" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "approvalRef", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type ReleaseMessage = {
  tipId: Hex;
  payee: Address;
  amount: bigint;
  approvalRef: Hex;
  /** Unix seconds (the hold's expiry). */
  deadline: bigint;
};

export function releaseTypedData(m: ReleaseMessage, escrow: Address, chainId: number = BASE_SEPOLIA_ID) {
  return {
    domain: {
      name: ESCROW_DOMAIN_NAME,
      version: ESCROW_DOMAIN_VERSION,
      chainId,
      verifyingContract: escrow,
    },
    types: RELEASE_TYPES,
    primaryType: "Release" as const,
    message: m,
  };
}

export type ReleaseTypedData = ReturnType<typeof releaseTypedData>;

export function releaseDigestOf(m: ReleaseMessage, escrow: Address, chainId: number = BASE_SEPOLIA_ID): Hex {
  return hashTypedData(releaseTypedData(m, escrow, chainId));
}

/** 16 bytes of a uuid as hex (`bytes16`). */
export function uuidBytes(uuid: string): Hex {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("not a uuid");
  return `0x${hex}`;
}

/** approvalRef = keccak256(abi.encode(bytes32 tipId, bytes16 approvalId)). */
export function approvalRefFor(tipId: Hex, approvalId: string): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes16" }], [tipId, uuidBytes(approvalId)]),
  );
}

/**
 * The same typed data as JSON for the browser wallet (`eth_signTypedData_v4`): uint256 values as
 * decimal strings, with `EIP712Domain` listed as wallets expect.
 */
export function releaseTypedDataJson(m: ReleaseMessage, escrow: Address, chainId: number = BASE_SEPOLIA_ID) {
  const t = releaseTypedData(m, escrow, chainId);
  return {
    domain: t.domain,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...RELEASE_TYPES,
    },
    primaryType: t.primaryType,
    message: { ...m, amount: m.amount.toString(), deadline: m.deadline.toString() },
  };
}
