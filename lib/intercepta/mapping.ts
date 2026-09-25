// Intercepta has no testnet chain ids (SPEC §7.1). Base Sepolia is screened as Base mainnet and
// Base Sepolia USDC as Base USDC; every result says so with SCREENED_AS.
import type { Address, Reason } from "../decision/types";
import { msg } from "../messages";

export const BASE_SEPOLIA = 84532;
export const BASE_MAINNET = 8453;
export const BASE_SEPOLIA_USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export type Mapped = { chainId: number; mappedFrom: string | null };

export function mapChain(chainId: number): Mapped {
  if (chainId === BASE_SEPOLIA) return { chainId: BASE_MAINNET, mappedFrom: `eip155:${chainId}` };
  if (chainId === BASE_MAINNET) return { chainId, mappedFrom: null };
  throw new Error(`No screening chain for ${chainId}`);
}

export function mapToken(address: Address, chainId: number): Mapped & { address: Address } {
  const chain = mapChain(chainId);
  if (chain.mappedFrom === null) return { address, ...chain };
  if (!sameAddress(address, BASE_SEPOLIA_USDC)) {
    throw new Error(`No mainnet equivalent for token ${address} on ${chainId}`);
  }
  return {
    address: BASE_USDC,
    chainId: chain.chainId,
    mappedFrom: `${chain.mappedFrom}/${address.toLowerCase()}`,
  };
}

// The local token pin (AGENTS rule 8): we only ever pay in Base Sepolia USDC.
export function isPinnedUsdc(token: Address): boolean {
  return sameAddress(token, BASE_SEPOLIA_USDC);
}

export function screenedAsReason(): Reason {
  return { source: "intercepta", code: "SCREENED_AS", text: msg("SCREENED_AS") };
}

export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
