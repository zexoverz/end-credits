import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import type { PackageSummary } from "@/lib/client/claim";
import { Header } from "./header";
import { PublicClaim } from "./public-claim";
const setClaimTx = `0x${"a".repeat(64)}`;
const claimTxs = [`0x${"b".repeat(64)}`, `0x${"c".repeat(64)}`];
describe("public repository claim", () => {
  it("shows every returned transaction without a private claim or invented payout amount", () => {
    const html = renderToStaticMarkup(
      createElement(PublicClaim, {
        claim: { wallet: `0x${"1".repeat(40)}`, setClaimTx, claimTxs },
      }),
    );
    for (const tx of [setClaimTx, ...claimTxs])
      expect(html).toContain(`https://sepolia.basescan.org/tx/${tx}`);
    expect(html).toContain("Registered receiving wallet");
    expect(html).not.toContain("claim-receipt-amount");
  });
  it("does not manufacture proof when no public claim exists", () => {
    expect(
      renderToStaticMarkup(createElement(PublicClaim, { claim: null })),
    ).toBe("");
  });
  it("keeps a finished claim with missing hashes honest", () => {
    const html = renderToStaticMarkup(
      createElement(PublicClaim, {
        claim: { wallet: null, setClaimTx: null, claimTxs: [] },
      }),
    );
    expect(html).toContain(
      "No transaction hashes were returned for this claim.",
    );
    expect(html).not.toContain("/tx/");
  });
});

it("never calls a refused payee payable, even if old data has both messages", () => {
  const s: PackageSummary = {
    package: "@endcredits-demo/refused",
    repo: null,
    state: "refused",
    reserved: "0",
    sessions: 0,
    headline: null,
    alsoAccepts: [],
    payee: null,
    alreadyPayable: "STALE PAYABLE",
    payeeRefused: "Agents refuse to pay: recorded refusal.",
    claimed: null,
    cooling: null,
    maintainer: null,
    claim: null,
    payeeRisk: null,
    errors: [],
  };
  const html = renderToStaticMarkup(createElement(Header, { s }));
  expect(html).toContain("Agents refuse to pay: recorded refusal.");
  expect(html).not.toContain("STALE PAYABLE");
});
