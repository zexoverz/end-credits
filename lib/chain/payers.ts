// One payer key per owner (multi-owner, decisions.md). Each owner's payer is derived from the
// master PAYER_PRIVATE_KEY and the owner id, so no new secret is stored and every key can be
// re-derived. The first owner keeps the master key itself. The payer is the spender the owner's
// budget wallet allows, the escrow payer whose approver is the owner's wallet, and the x402 signer.
import { concat, getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readEnv } from "../env";
import { chain, createChainContext, payerAccount, type ChainContext } from "./keys";

type Env = Record<string, string | undefined>;

/** The payer key of `ownerId` under `master`. Deterministic; never stored or logged. */
export function derivePayerKey(master: Hex, ownerId: string): Hex {
  return keccak256(concat([master, stringToHex(`endcredits-payer:${ownerId}`)]));
}

/** The payer address a new owner gets. */
export function payerAddressFor(ownerId: string, env: Env = process.env): Address {
  return privateKeyToAccount(derivePayerKey(masterKey(env), ownerId)).address;
}

function masterKey(env: Env): Hex {
  // payerAccount validates the format and names the env var on failure.
  payerAccount(env);
  return env.PAYER_PRIVATE_KEY as Hex;
}

export class PayerMismatchError extends Error {
  constructor() {
    super("stored payer address matches neither the master nor the derived key");
    this.name = "PayerMismatchError";
  }
}

/** The key behind `owner.payerAddress`: the master key, or the owner's derived key. */
export function payerKeyFor(owner: { id: string; payerAddress: string }, env: Env = process.env): Hex {
  const master = masterKey(env);
  const want = getAddress(owner.payerAddress);
  if (privateKeyToAccount(master).address === want) return master;
  const derived = derivePayerKey(master, owner.id);
  if (privateKeyToAccount(derived).address === want) return derived;
  throw new PayerMismatchError();
}

const contexts = new Map<string, ChainContext>();

/**
 * The chain context that signs as `owner`'s payer: the default context for the master key, else one
 * sharing its public client and recorder (and so its tx queue) with only the payer swapped.
 */
export function chainForOwner(owner: { id: string; payerAddress: string }, env: Env = process.env): ChainContext {
  const base = chain();
  const key = payerKeyFor(owner, env);
  const account = privateKeyToAccount(key);
  if (account.address === base.payer.account.address) return base;
  let ctx = contexts.get(account.address);
  if (!ctx) {
    ctx = createChainContext({
      rpcUrl: readEnv("BASE_SEPOLIA_RPC", env),
      chain: base.publicClient.chain,
      payer: account,
      recorder: base.recorder.account,
      escrow: base.escrow,
      usdc: base.usdc,
    });
    ctx = { ...ctx, publicClient: base.publicClient, recorder: base.recorder };
    contexts.set(account.address, ctx);
  }
  return ctx;
}
