import { describe, expect, it, vi } from "vitest";
import {
  ContractFunctionRevertedError,
  encodeErrorResult,
  NonceTooLowError,
  type Address,
  type Hash,
} from "viem";
import { escrowAbi } from "./abi";
import { createTxQueue, TxRevertedError, type ContractCall, type TxIo } from "./txqueue";

const A: Address = "0x00000000000000000000000000000000000000aa";
const B: Address = "0x00000000000000000000000000000000000000bb";
const ESCROW: Address = "0x0000000000000000000000000000000000000e5c";
const TIP = `0x${"11".repeat(32)}` as const;

const call: ContractCall = {
  address: ESCROW,
  abi: escrowAbi,
  functionName: "release",
  args: [TIP, TIP],
};

function revert(errorName: "TipExists" | "NotRecorder") {
  const data =
    errorName === "TipExists"
      ? encodeErrorResult({ abi: escrowAbi, errorName, args: [TIP] })
      : encodeErrorResult({ abi: escrowAbi, errorName });
  return new ContractFunctionRevertedError({ abi: escrowAbi, data, functionName: "hold" });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fakeIo(overrides: Partial<TxIo> = {}) {
  let n = 0;
  const io: TxIo = {
    pendingNonce: vi.fn(async () => 7),
    simulate: vi.fn(async () => {}),
    write: vi.fn(async () => `0x${(++n).toString(16).padStart(64, "0")}` as Hash),
    waitForReceipt: vi.fn(async () => ({ status: "success" as const, blockNumber: BigInt(10) })),
    ...overrides,
  };
  return io;
}

describe("txqueue", () => {
  it("sends with the pending nonce from the node and returns the hash", async () => {
    const io = fakeIo();
    const hash = await createTxQueue(io).submit(A, call);
    expect(io.pendingNonce).toHaveBeenCalledWith(A);
    expect(io.write).toHaveBeenCalledWith(A, call, 7);
    expect(io.waitForReceipt).toHaveBeenCalledWith(hash);
  });

  it("keeps one tx in flight per key", async () => {
    const receipt = deferred<{ status: "success"; blockNumber: bigint }>();
    const io = fakeIo({ waitForReceipt: vi.fn(() => receipt.promise) });
    const q = createTxQueue(io);
    const first = q.submit(A, call);
    const second = q.submit(A, call);
    await new Promise((r) => setTimeout(r, 10));
    expect(io.write).toHaveBeenCalledTimes(1);
    receipt.resolve({ status: "success", blockNumber: BigInt(1) });
    await Promise.all([first, second]);
    expect(io.write).toHaveBeenCalledTimes(2);
  });

  it("does not make one key wait for another", async () => {
    const receipt = deferred<{ status: "success"; blockNumber: bigint }>();
    const io = fakeIo({
      waitForReceipt: vi.fn((hash: Hash) =>
        hash.endsWith("1") ? receipt.promise : Promise.resolve({ status: "success" as const, blockNumber: BigInt(1) }),
      ),
    });
    const q = createTxQueue(io);
    const first = q.submit(A, call);
    await new Promise((r) => setTimeout(r, 5));
    await q.submit(B, call);
    expect(io.write).toHaveBeenLastCalledWith(B, call, 7);
    receipt.resolve({ status: "success", blockNumber: BigInt(1) });
    await first;
  });

  it("retries once on nonce too low with a fresh nonce", async () => {
    const write = vi
      .fn<TxIo["write"]>()
      .mockRejectedValueOnce(new NonceTooLowError({ nonce: 7 }))
      .mockResolvedValueOnce(`0x${"ab".repeat(32)}`);
    const pendingNonce = vi.fn<TxIo["pendingNonce"]>().mockResolvedValueOnce(7).mockResolvedValueOnce(8);
    const io = fakeIo({ write, pendingNonce });
    await createTxQueue(io).submit(A, call);
    expect(write).toHaveBeenNthCalledWith(2, A, call, 8);
  });

  it("gives up after a second nonce too low", async () => {
    const write = vi.fn<TxIo["write"]>().mockRejectedValue(new NonceTooLowError({ nonce: 7 }));
    const io = fakeIo({ write });
    await expect(createTxQueue(io).submit(A, call)).rejects.toBeInstanceOf(NonceTooLowError);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does not retry other send errors", async () => {
    const write = vi.fn<TxIo["write"]>().mockRejectedValue(new Error("insufficient funds"));
    const io = fakeIo({ write });
    await expect(createTxQueue(io).submit(A, call)).rejects.toThrow("insufficient funds");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("throws the decoded custom error when the call would revert, without sending", async () => {
    const io = fakeIo({ simulate: vi.fn().mockRejectedValue(revert("TipExists")) });
    const err = await createTxQueue(io, { staleDelayMs: 0 }).submit(A, call).catch((e) => e);
    expect(err).toBeInstanceOf(TxRevertedError);
    expect(err.errorName).toBe("TipExists");
    expect(err.message).toBe("release reverted: TipExists");
    expect(io.write).not.toHaveBeenCalled();
  });

  it("re-simulates after a stale revert and sends once", async () => {
    const simulate = vi
      .fn<TxIo["simulate"]>()
      .mockRejectedValueOnce(revert("TipExists"))
      .mockResolvedValueOnce(undefined);
    const io = fakeIo({ simulate });
    await createTxQueue(io, { staleDelayMs: 0 }).submit(A, call);
    expect(simulate).toHaveBeenCalledTimes(2);
    expect(io.write).toHaveBeenCalledTimes(1);
  });

  it("throws the named error after 3 simulations that all revert, never sending", async () => {
    const simulate = vi.fn<TxIo["simulate"]>().mockRejectedValue(revert("NotRecorder"));
    const io = fakeIo({ simulate });
    const err = await createTxQueue(io, { staleDelayMs: 0 }).submit(A, call).catch((e) => e);
    expect(err).toBeInstanceOf(TxRevertedError);
    expect(err.errorName).toBe("NotRecorder");
    expect(simulate).toHaveBeenCalledTimes(3);
    expect(io.write).not.toHaveBeenCalled();
  });

  it("waits between simulations", async () => {
    vi.useFakeTimers();
    try {
      const simulate = vi
        .fn<TxIo["simulate"]>()
        .mockRejectedValueOnce(revert("TipExists"))
        .mockResolvedValueOnce(undefined);
      const io = fakeIo({ simulate });
      const done = createTxQueue(io, { staleDelayMs: 1_500 }).submit(A, call);
      await vi.advanceTimersByTimeAsync(1_499);
      expect(simulate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(simulate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a simulation that fails without a revert", async () => {
    const simulate = vi.fn<TxIo["simulate"]>().mockRejectedValue(new Error("fetch failed"));
    const io = fakeIo({ simulate });
    await expect(createTxQueue(io, { staleDelayMs: 0 }).submit(A, call)).rejects.toThrow("fetch failed");
    expect(simulate).toHaveBeenCalledTimes(1);
  });

  it("names the custom error when a sent tx reverts", async () => {
    const simulate = vi
      .fn<TxIo["simulate"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(revert("NotRecorder"));
    const io = fakeIo({
      simulate,
      waitForReceipt: vi.fn(async () => ({ status: "reverted" as const, blockNumber: BigInt(10) })),
    });
    const err = await createTxQueue(io).submit(A, call).catch((e) => e);
    expect(err).toBeInstanceOf(TxRevertedError);
    expect(err.errorName).toBe("NotRecorder");
    expect(err.hash).toMatch(/^0x/);
    expect(simulate).toHaveBeenLastCalledWith(A, call, BigInt(9));
  });

  it("reports an unknown reason when the replay does not revert", async () => {
    const io = fakeIo({
      waitForReceipt: vi.fn(async () => ({ status: "reverted" as const, blockNumber: BigInt(10) })),
    });
    const err = await createTxQueue(io).submit(A, call).catch((e) => e);
    expect(err.errorName).toBe("unknown");
  });

  it("keeps the queue moving after a failure", async () => {
    const write = vi
      .fn<TxIo["write"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(`0x${"cd".repeat(32)}`);
    const q = createTxQueue(fakeIo({ write }));
    const [a, b] = await Promise.allSettled([q.submit(A, call), q.submit(A, call)]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("fulfilled");
  });
});
