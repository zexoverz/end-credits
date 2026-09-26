import { describe, expect, it, vi } from "vitest";
import type { MultiBaasClient } from "./client";
import { savedQueries } from "./queries";
import { paidQuerySync } from "./sync";

const A = "0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6";
const B = "0x2bCfcf2c7092044D04Cf6727fef2D28B924dee96";

function fakeMb() {
  const put = vi.fn(async () => ({}));
  return { mb: { put } as unknown as MultiBaasClient, put };
}

describe("paid_totals sync", () => {
  it("saves once per payer set and again when an owner is added", async () => {
    const { mb, put } = fakeMb();
    let payers = [A];
    const sync = paidQuerySync(mb, async () => payers);
    expect(await sync()).toBe(true);
    expect(await sync()).toBe(false);
    payers = [A, B];
    expect(await sync()).toBe(true);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenLastCalledWith("/queries/paid_totals", savedQueries([A.toLowerCase(), B.toLowerCase()].sort()).paid_totals);
  });

  it("retries after a failed save", async () => {
    const { mb, put } = fakeMb();
    put.mockRejectedValueOnce(new Error("down"));
    const sync = paidQuerySync(mb, async () => [A]);
    await expect(sync()).rejects.toThrow("down");
    expect(await sync()).toBe(true);
  });
});
