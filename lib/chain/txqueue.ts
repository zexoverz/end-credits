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
  type Hex,
  type PublicClient,
} from "viem";
import type { SignerClient } from "./keys";

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/** A plain call with prebuilt calldata (an ERC-6492 factory deploy); `functionName` names it in errors. */
export interface RawCall {
  to: Address;
  data: Hex;
  functionName: string;
}

export type TxCall = ContractCall | RawCall;

const isRaw = (c: TxCall): c is RawCall => "data" in c;

export interface TxReceiptLite {
  status: "success" | "reverted";
  blockNumber: bigint;
}

/** The node-facing side of the queue; a fake in tests, viem in the app. */
export interface TxIo {
  pendingNonce(from: Address): Promise<number>;
  /** Throws when the call would revert (at `blockNumber` when given). */
  simulate(from: Address, call: TxCall, blockNumber?: bigint): Promise<void>;
  write(from: Address, call: TxCall, nonce: number): Promise<Hash>;
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
  submit(from: Address, call: TxCall): Promise<Hash>;
}

export interface TxQueueOptions {
  /** Simulations after the first when one reverts with a custom error. Default 2. */
  staleRetries?: number;
  /** Wait before each re-simulation, ms. Default 1500. */
  staleDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTxQueue(io: TxIo, opts: TxQueueOptions = {}): TxQueue {
  const tails = new Map<string, Promise<unknown>>();
  // Last nonce a node accepted from us, per key. A lagging node can report a pending count that
  // does not include our own last send, so never go below lastUsed + 1.
  const lastUsed = new Map<string, number>();
  const staleRetries = opts.staleRetries ?? 2;
  const staleDelayMs = opts.staleDelayMs ?? 1_500;

  // A load-balanced RPC (sepolia.base.org) can answer from a node that has not seen the tx we just
  // mined, so a revert here may be stale. Re-simulate a few times before believing it.
  async function simulateOrThrow(from: Address, call: TxCall) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await io.simulate(from, call);
      } catch (err) {
        const name = revertName(err);
        if (!name) throw err;
        if (attempt >= staleRetries) {
          throw new TxRevertedError(call.functionName, name, undefined, { cause: err });
        }
        await sleep(staleDelayMs);
      }
    }
  }

  async function nextNonce(from: Address): Promise<number> {
    const pending = await io.pendingNonce(from);
    const last = lastUsed.get(from.toLowerCase());
    return last === undefined ? pending : Math.max(pending, last + 1);
  }

  async function write(from: Address, call: TxCall, nonce: number): Promise<Hash> {
    const hash = await io.write(from, call, nonce);
    lastUsed.set(from.toLowerCase(), nonce);
    return hash;
  }

  async function send(from: Address, call: TxCall): Promise<Hash> {
    try {
      return await write(from, call, await nextNonce(from));
    } catch (err) {
      if (!isNonceTooLow(err)) throw err;
      return write(from, call, await nextNonce(from));
    }
  }

  async function reasonAfterRevert(from: Address, call: TxCall, block: bigint) {
    try {
      await io.simulate(from, call, block - BigInt(1));
      return "unknown";
    } catch (err) {
      return revertName(err) ?? "unknown";
    }
  }

  async function run(from: Address, call: TxCall): Promise<Hash> {
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
      if (isRaw(call)) {
        await publicClient.call({ account: from, to: call.to, data: call.data, blockNumber });
        return;
      }
      await publicClient.simulateContract({ ...call, account: signer(from).account, blockNumber });
    },
    write: (from, call, nonce) => {
      const s = signer(from);
      if (isRaw(call)) {
        return s.sendTransaction({ account: s.account, chain: s.chain, to: call.to, data: call.data, nonce });
      }
      return s.writeContract({ ...call, account: s.account, chain: s.chain, nonce });
    },
    async waitForReceipt(hash) {
      const r = await publicClient.waitForTransactionReceipt({ hash });
      return { status: r.status, blockNumber: r.blockNumber };
    },
  };
}
