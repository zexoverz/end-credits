// Fixture package names only (AGENTS rule 9).
import { describe, expect, it } from "vitest";
import { decide } from "./matrix";
import { spamCount, type SessionPackage } from "./spam";

const NOW = new Date("2026-09-26T00:00:00Z");
const PAYEE = "0xabcdef0000000000000000000000000000000005";
const OTHER = "0x6666660000000000000000000000000000000006";
const OLD = new Date("2020-01-01T00:00:00Z");
const NEW = new Date("2026-09-20T00:00:00Z");

const pkg = (name: string, payee: string, weeklyDownloads: number | null, firstPublishedAt: Date | null): SessionPackage => ({
  name,
  payee: payee as `0x${string}`,
  weeklyDownloads,
  firstPublishedAt,
});

function decideWith(count: { count: number } | null) {
  return decide({
    pkg: "@endcredits-demo/spam-0",
    payee: PAYEE,
    paymentToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    screen: { toxicScore: 0, traits: [], tokenAction: "info", tokenDetectors: [], impersonation: null },
    capped: false,
    amount: BigInt(100000),
    change: { changed: false },
    lookalike: null,
    spam: count,
    noCodeOnBase: false,
  });
}

describe("spamCount", () => {
  it("5 low-download packages sharing a payee -> refused SPAM", () => {
    const session = [0, 1, 2, 3, 4].map((n) => pkg(`@endcredits-demo/spam-${n}`, PAYEE, 12, OLD));
    const spam = spamCount(PAYEE, session, NOW);
    expect(spam).toEqual({ count: 5 });
    const d = decideWith(spam);
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0].code).toBe("SPAM");
  });

  it("9 high-download packages sharing a payee (a real monorepo pattern) -> not refused", () => {
    const session = Array.from({ length: 9 }, (_, n) => pkg(`@endcredits-demo/mono-${n}`, PAYEE, 5_000_000, OLD));
    const spam = spamCount(PAYEE, session, NOW);
    expect(spam).toBeNull();
    expect(decideWith(spam).outcome).toBe("paid");
  });

  it("counts packages first published in the last 30 days even with downloads", () => {
    const session = [0, 1, 2, 3, 4].map((n) => pkg(`@endcredits-demo/new-${n}`, PAYEE, 50_000, NEW));
    expect(spamCount(PAYEE, session, NOW)).toEqual({ count: 5 });
  });

  it("only counts packages with this payee, compared case-insensitively", () => {
    const session = [
      pkg("@endcredits-demo/a", PAYEE.toUpperCase().replace("0X", "0x"), 1, OLD),
      pkg("@endcredits-demo/b", OTHER, 1, OLD),
    ];
    expect(spamCount(PAYEE, session, NOW)).toEqual({ count: 1 });
  });

  it("does not count missing download data as low", () => {
    expect(spamCount(PAYEE, [pkg("@endcredits-demo/x", PAYEE, null, null)], NOW)).toBeNull();
  });
});
