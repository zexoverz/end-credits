import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ActionQueue } from "./insights";
import type { Action } from "@/lib/multibaas/actions";

describe("dashboard action destinations", () => {
  it("distinguishes an unavailable actions field from an empty queue", () => {
    const html = renderToStaticMarkup(createElement(ActionQueue, {}));
    expect(html).toContain(
      "Pending actions are not available in this response.",
    );
    expect(html).not.toContain("You’re all caught up.");
  });
  it("keeps server links for signatures and claims distinct", () => {
    const actions: Action[] = [
      {
        kind: "approve_hold",
        title: "Review the hold",
        detail: null,
        href: "/app/approve/0xabc",
        source: "multibaas",
        amount: { micro: "250000", usdc: "0.25" },
        tipId: "0xabc",
        package: null,
        payee: null,
        expiresAt: "2026-09-26T23:00:00.000Z",
      },
      {
        kind: "reserve_waiting",
        title: "Waiting for a maintainer",
        detail: null,
        href: "/app/npm/@endcredits-demo/unclaimed",
        source: "multibaas",
        amount: { micro: "250000", usdc: "0.25" },
        package: "@endcredits-demo/unclaimed",
        packageKey: "0xdef",
        sessions: 1,
      },
    ];
    const html = renderToStaticMarkup(createElement(ActionQueue, { actions }));
    expect(html).toContain('href="/app/approve/0xabc"');
    expect(html).toContain('href="/app/npm/@endcredits-demo/unclaimed"');
    expect(html).toContain("Review &amp; sign");
    expect(html).toContain("View claim");
  });
});
