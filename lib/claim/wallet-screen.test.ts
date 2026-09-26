// The claim wallet screen through the real Intercepta client, with a fake fetch.
import { describe, expect, it } from "vitest";
import { createIntercepta } from "../intercepta/client";
import { memoryRepo } from "../intercepta/__fixtures__/memory-repo";
import { NO_HISTORY_BODY } from "../intercepta/no-history";
import { refusalOf } from "./payout";
import { quickScanWallet } from "./wallet-screen";

const WALLET = "0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551" as const;

function scanWith(body: unknown, status: number) {
  const fetch = async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const c = createIntercepta({ base: "https://intercepta.test", apiKey: "k", repo: memoryRepo().repo, fetch });
  return quickScanWallet(c, WALLET);
}

describe("claim wallet screen", () => {
  it("accepts a wallet with no mainnet history", async () => {
    const s = await scanWith(NO_HISTORY_BODY, 404);
    expect(s.ok).toBe(true);
    if (s.ok) expect(refusalOf(s)).toBeNull();
  });

  it("still refuses a critical trait or a score above 50", async () => {
    const critical = await scanWith({ toxicScore: 10, traits: [{ name: "sanction_address", description: "OFAC" }] }, 200);
    expect(critical.ok && refusalOf(critical)).toBe("OFAC");
    const toxic = await scanWith({ toxicScore: 51, traits: [] }, 200);
    expect(toxic.ok && refusalOf(toxic)).toBe("toxic score 51");
  });

  it("fails closed on any other 404 or a server error", async () => {
    expect(await scanWith({ status: 404, response: { message: "Not Found" } }, 404)).toMatchObject({ ok: false, error: "HTTP" });
    expect(await scanWith({}, 500)).toMatchObject({ ok: false, error: "HTTP" });
  });
});
