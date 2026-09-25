// Live: calls the real Intercepta API (2 requests). Skipped without INTERCEPTA_API_KEY.
import { describe, expect, it } from "vitest";
import { createIntercepta } from "./client";
import { BASE_SEPOLIA, BASE_SEPOLIA_USDC } from "./mapping";
import { memoryRepo } from "./__fixtures__/memory-repo";

const key = process.env.INTERCEPTA_API_KEY;
const OFAC_LAZARUS = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"; // SPEC §7.4

describe.skipIf(!key)("intercepta live", () => {
  const { repo, rows } = memoryRepo();
  const c = createIntercepta({
    base: process.env.INTERCEPTA_BASE ?? "https://api.web3antivirus.io",
    apiKey: key ?? "",
    repo,
  });

  it("quick-scans an OFAC address and stores the row", async () => {
    const r = await c.quickScan(OFAC_LAZARUS);
    expect(r.ok).toBe(true);
    expect(rows.at(-1)).toMatchObject({ kind: "address", status: 200 });
    expect(rows.at(-1)?.latencyMs).toBeGreaterThan(0);
  });

  it("reads Base USDC token risks on 8453", async () => {
    const r = await c.tokenRisks(BASE_SEPOLIA_USDC, BASE_SEPOLIA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.action).not.toBe("block");
  });
});
