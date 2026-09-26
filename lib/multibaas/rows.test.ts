import { describe, expect, it, vi } from "vitest";
import type { MultiBaasClient } from "./client";
import { eventName, queryRows, toBool, toBytes32, toMicro } from "./rows";

function fakeMb(pages: unknown[]): MultiBaasClient & { get: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    get: vi.fn(async () => pages[i++]),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  } as never;
}

describe("row values", () => {
  it("reads base-unit integers exactly", () => {
    expect(toMicro("250000")).toBe(250000n);
    expect(toMicro(250000)).toBe(250000n);
    expect(toMicro("123456789012345678901234567890")).toBe(123456789012345678901234567890n);
    expect(toMicro("400000.000")).toBe(400000n);
  });

  it("refuses anything that is not a whole base-unit amount", () => {
    for (const v of ["1.5", "1e21", "-5", "", null, undefined, 1.5, "0x10"]) {
      expect(() => toMicro(v), String(v)).toThrow(/unexpected amount/);
    }
  });

  it("reads bools and event signatures", () => {
    expect(toBool("true")).toBe(true);
    expect(toBool(false)).toBe(false);
    expect(() => toBool("yes")).toThrow();
    expect(eventName("Held(bytes32,bytes32,address,address,uint256,uint8,uint64)")).toBe("Held");
    expect(eventName("Released")).toBe("Released");
  });
});

describe("queryRows", () => {
  it("pages until a short page", async () => {
    const mb = fakeMb([{ rows: [{ a: 1 }, { a: 2 }] }, { rows: [{ a: 3 }] }]);
    const rows = await queryRows(mb, "paid_totals", { limit: 2 });
    expect(rows).toHaveLength(3);
    expect(mb.get.mock.calls.map((c) => c[0])).toEqual([
      "/queries/paid_totals/results?offset=0&limit=2",
      "/queries/paid_totals/results?offset=2&limit=2",
    ]);
  });

  it("reads one page when asked", async () => {
    const mb = fakeMb([{ rows: [{ a: 1 }, { a: 2 }] }]);
    await queryRows(mb, "recent", { limit: 2, all: false });
    expect(mb.get).toHaveBeenCalledTimes(1);
  });

  it("throws on a result without rows", async () => {
    const mb = fakeMb([{ nope: true }]);
    await expect(queryRows(mb, "held_status")).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("toBytes32 on the live format", () => {
  const hex = "0xc13c5db959d8fae6245e5108dbb170f2c7ed8f4a195af441057dced278bde488";
  const live =
    "[193, 60, 93, 185, 89, 216, 250, 230, 36, 94, 81, 8, 219, 177, 112, 242, 199, 237, 143, 74, 25, 90, 244, 65, 5, 125, 206, 210, 120, 189, 228, 136]";

  it("reads the byte-array string MultiBaas returns for bytes32 columns", () => {
    expect(toBytes32(live)).toBe(hex);
    expect(toBytes32(hex)).toBe(hex);
  });

  it("still refuses a wrong length or a byte out of range", () => {
    expect(() => toBytes32("[1, 2, 3]")).toThrow();
    expect(() => toBytes32(live.replace("193", "300"))).toThrow();
  });
});
