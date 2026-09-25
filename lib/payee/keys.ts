// Chain keys (DESIGN §16): the same hashes EndCreditsEscrow computes.
import { encodeAbiParameters, encodePacked, keccak256, type Hex } from "viem";

export function packageKey(name: string): Hex {
  return keccak256(encodePacked(["string", "string"], ["npm:", name]));
}

export function tipId(sessionKey: Hex, pkgKey: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [sessionKey, pkgKey]),
  );
}
