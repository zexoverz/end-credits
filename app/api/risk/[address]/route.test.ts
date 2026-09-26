import { describe, expect, it } from "vitest";
import { normalizeAddress } from "@/lib/risk/profile";
import { GET } from "./route";

describe("GET /api/risk/<address>", () => {
  it("400 for anything that is not an address", async () => {
    for (const bad of ["0x123", "vitalik.eth", "0x52DBDeaDd4ED42877dC6099A3B1C02c79876B550x"]) {
      const res = await GET(new Request("http://x"), { params: Promise.resolve({ address: bad }) });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_address" });
    }
  });

  it("accepts lowercase and checksummed, rejects a bad checksum", () => {
    const good = "0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551";
    expect(normalizeAddress(good)).toBe(good.toLowerCase());
    expect(normalizeAddress(good.toLowerCase())).toBe(good.toLowerCase());
    expect(normalizeAddress("0x52dBDeaDd4ED42877dC6099A3B1C02c79876B551")).toBeNull();
  });
});
