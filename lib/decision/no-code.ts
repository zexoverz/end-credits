// P1 (DESIGN §8): a payee that is a contract on Ethereum mainnet but has no code on Base mainnet
// (typically a Safe deployed only on L1) cannot receive funds on Base, so the matrix holds it.
// Needed before any mainnet round. RPC failures throw; the caller must not treat them as clean.
import { createPublicClient, http, type Hex } from "viem";
import { base, mainnet } from "viem/chains";
import type { Address } from "./types";

export const DEFAULT_ETH_MAINNET_RPC = "https://ethereum-rpc.publicnode.com";
export const DEFAULT_BASE_MAINNET_RPC = "https://mainnet.base.org";

type CodeReader = (address: Address) => Promise<Hex | undefined>;
export type CodeReaders = { ethereum: CodeReader; base: CodeReader };

export function mainnetReaders(env: Record<string, string | undefined> = process.env): CodeReaders {
  const eth = createPublicClient({ chain: mainnet, transport: http(env.ETH_MAINNET_RPC || DEFAULT_ETH_MAINNET_RPC) });
  const b = createPublicClient({ chain: base, transport: http(env.BASE_MAINNET_RPC || DEFAULT_BASE_MAINNET_RPC) });
  return {
    ethereum: (address) => eth.getCode({ address }),
    base: (address) => b.getCode({ address }),
  };
}

export async function noCodeOnBase(payee: Address, readers: CodeReaders = mainnetReaders()): Promise<boolean> {
  const [onEthereum, onBase] = await Promise.all([readers.ethereum(payee), readers.base(payee)]);
  return hasCode(onEthereum) && !hasCode(onBase);
}

// An EIP-7702 delegation designator (0xef0100 + address) marks an EOA, not a contract.
function hasCode(code: Hex | undefined): boolean {
  return code !== undefined && code !== "0x" && !code.toLowerCase().startsWith("0xef0100");
}
