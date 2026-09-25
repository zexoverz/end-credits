// One chain tx in flight per key (DESIGN §7). Each submit simulates first (so a revert is named
// before anything is signed), takes the nonce from the node with blockTag pending, retries once on
// `nonce too low`, and waits for the receipt.
import {
  BaseError,
  ContractFunctionRevertedError,
  NonceTooLowError,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import type { SignerClient } from "./keys";

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

export interface TxReceiptLite {
  status: "success" | "reverted";
  blockNumber: bigint;
}

/** The node-facing side of the queue; a fake in tests, viem in the app. */
export interface TxIo {
  pendingNonce(from: Address): Promise<number>;
  /** Throws when the call would revert (at `blockNumber` when given). */
  simulate(from: Address, call: ContractCall, blockNumber?: bigint): Promise<void>;
  write(from: Address, call: ContractCall, nonce: number): Promise<Hash>;
  waitForReceipt(hash: Hash): Promise<TxReceiptLite>;
}

export class TxRevertedError extends Error {
  constructor(
    readonly functionName: string,
    readonly errorName: string,
    readonly hash?: Hash,
    options?: { cause?: unknown },
  ) {
    super(`${functionName} reverted: ${errorName}`, options);
    this.name = "TxRevertedError";
  }
}

/** The custom error name (or revert reason) inside a viem error, if there is one. */
export function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;
  return reverted.data?.errorName ?? reverted.reason ?? "unknown";
}

function isNonceTooLow(err: unknown): boolean {
  if (err instanceof BaseError && err.walk((e) => e instanceof NonceTooLowError)) return true;
  return err instanceof Error && /nonce too low/i.test(err.message);
}

export interface TxQueue {
  submit(from: Address, call: ContractCall): Promise<Hash>;
}

export function createTxQueue(io: TxIo): TxQueue {
  const tails = new Map<string, Promise<unknown>>();

  async function simulateOrThrow(from: Address, call: ContractCall) {
    try {
      await io.simulate(from, call);
    } catch (err) {
      const name = revertName(err);
      if (name) throw new TxRevertedError(call.functionName, name, undefined, { cause: err });
      throw err;
    }
  }

  async function send(from: Address, call: ContractCall): Promise<Hash> {
    try {
      return await io.write(from, call, await io.pendingNonce(from));
    } catch (err) {
      if (!isNonceTooLow(err)) throw err;
      return io.write(from, call, await io.pendingNonce(from));
    }
  }

  async function reasonAfterRevert(from: Address, call: ContractCall, block: bigint) {
    try {
      await io.simulate(from, call, block - BigInt(1));
      return "unknown";
    } catch (err) {
      return revertName(err) ?? "unknown";
    }
  }

  async function run(from: Address, call: ContractCall): Promise<Hash> {
    await simulateOrThrow(from, call);
    const hash = await send(from, call);
    const receipt = await io.waitForReceipt(hash);
    if (receipt.status === "reverted") {
      const name = await reasonAfterRevert(from, call, receipt.blockNumber);
      throw new TxRevertedError(call.functionName, name, hash);
    }
    return hash;
  }

  return {
    submit(from, call) {
      const key = from.toLowerCase();
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.catch(() => undefined).then(() => run(from, call));
      tails.set(key, next);
      return next;
    },
  };
}

/** viem-backed io over one public client and the wallet clients allowed to sign. */
export function viemIo(publicClient: PublicClient, signers: readonly SignerClient[]): TxIo {
  const byAddress = new Map(signers.map((s) => [s.account.address.toLowerCase(), s]));
  const signer = (from: Address) => {
    const s = byAddress.get(from.toLowerCase());
    if (!s) throw new Error(`No signer for ${from}`);
    return s;
  };

  return {
    pendingNonce: (from) => publicClient.getTransactionCount({ address: from, blockTag: "pending" }),
    async simulate(from, call, blockNumber) {
      await publicClient.simulateContract({ ...call, account: signer(from).account, blockNumber });
    },
    write: (from, call, nonce) => {
      const s = signer(from);
      return s.writeContract({ ...call, account: s.account, chain: s.chain, nonce });
    },
    async waitForReceipt(hash) {
      const r = await publicClient.waitForTransactionReceipt({ hash });
      return { status: r.status, blockNumber: r.blockNumber };
    },
  };
}
