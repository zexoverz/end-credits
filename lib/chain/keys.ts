// Server-held keys and the viem clients built on them. Keys come from env and are never logged:
// a malformed key is reported by its env name only.
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readEnv } from "../env";

type Env = Record<string, string | undefined>;

export type SignerClient = WalletClient<Transport, Chain, Account>;

export interface ChainContext {
  publicClient: PublicClient<Transport, Chain>;
  payer: SignerClient;
  recorder: SignerClient;
  escrow: Address;
  usdc: Address;
}

const KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function readKey(name: string, env: Env): Hex {
  const value = readEnv(name, env);
  if (!KEY_PATTERN.test(value)) throw new Error(`Invalid private key in env: ${name}`);
  return value as Hex;
}

function readAddress(name: string, env: Env): Address {
  const value = readEnv(name, env);
  if (!ADDRESS_PATTERN.test(value)) throw new Error(`Invalid address in env: ${name}`);
  return value as Address;
}

export function payerAccount(env: Env = process.env): Account {
  return privateKeyToAccount(readKey("PAYER_PRIVATE_KEY", env));
}

export function recorderAccount(env: Env = process.env): Account {
  return privateKeyToAccount(readKey("RECORDER_PRIVATE_KEY", env));
}

export interface ChainParams {
  rpcUrl: string;
  chain: Chain;
  payer: Account;
  recorder: Account;
  escrow: Address;
  usdc: Address;
  /** Receipt polling, ms. Base Sepolia makes a block every 2 s. */
  pollingInterval?: number;
}

export function createChainContext(p: ChainParams): ChainContext {
  const transport = http(p.rpcUrl);
  const pollingInterval = p.pollingInterval ?? 1_000;
  const wallet = (account: Account) =>
    createWalletClient({ account, chain: p.chain, transport, pollingInterval });
  return {
    publicClient: createPublicClient({ chain: p.chain, transport, pollingInterval }),
    payer: wallet(p.payer),
    recorder: wallet(p.recorder),
    escrow: p.escrow,
    usdc: p.usdc,
  };
}

/** Base Sepolia clients for the payer and recorder keys, from env. */
export function chainFromEnv(env: Env = process.env): ChainContext {
  return createChainContext({
    rpcUrl: readEnv("BASE_SEPOLIA_RPC", env),
    chain: baseSepolia,
    payer: payerAccount(env),
    recorder: recorderAccount(env),
    escrow: readAddress("ESCROW_ADDRESS", env),
    usdc: readAddress("USDC_ADDRESS", env),
  });
}

let cached: ChainContext | undefined;

/** Process-wide context from `process.env`, built on first use. */
export function chain(): ChainContext {
  cached ??= chainFromEnv();
  return cached;
}
