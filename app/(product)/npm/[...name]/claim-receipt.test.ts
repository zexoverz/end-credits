import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClaimView } from "@/lib/client/claim";
import { ClaimReceipt } from "./claim-receipt";

const setTx = `0x${"a".repeat(64)}`;
const claimTxs = [`0x${"b".repeat(64)}`, `0x${"c".repeat(64)}`];
const view: ClaimView = {
  status: "claimed",
  repo: "endcredits-demo/claim",
  wallet: `0x${"1".repeat(40)}`,
  prMode: "api",
  prNumber: 1,
  prUrl: null,
  claimedAmount: "0.75",
  setClaimTx: setTx,
  claimTxs,
  coolingUntil: null,
  code: "CLAIMED",
  message: null,
};
const render = (overrides: Partial<ClaimView> = {}) =>
  renderToStaticMarkup(
    createElement(ClaimReceipt, { claim: { ...view, ...overrides } }),
  );
describe("maintainer transaction receipt", () => {
  it("links the registration and every repository payout separately on Base Sepolia", () => {
    const html = render();
    for (const hash of [setTx, ...claimTxs])
      expect(html).toContain(`href="https://sepolia.basescan.org/tx/${hash}"`);
    expect(html).toContain("setClaim");
    expect(html).toContain("transaction 2");
    expect(html).toContain("0.75");
  });
  it("does not invent transaction links when the server has none", () => {
    const html = render({ setClaimTx: null, claimTxs: [] });
    expect(html).not.toContain("/tx/");
    expect(html).toContain(
      "No transaction hashes were returned for this claim.",
    );
  });
  it("does not replace an unknown amount with zero", () => {
    const html = render({ claimedAmount: null });
    expect(html).toContain('class="claim-receipt-amount">—');
    expect(html).not.toContain('class="claim-receipt-amount">0');
  });
});
