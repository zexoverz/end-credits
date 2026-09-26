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
        payer: "0xabc",
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
    const html = renderToStaticMarkup(
      createElement(ActionQueue, { actions, agentWallet: "0xAbC" }),
    );
    expect(html).toContain('href="/app/approve/0xabc"');
    expect(html).toContain('href="/app/npm/@endcredits-demo/unclaimed"');
    expect(html).toContain("Review &amp; sign");
    expect(html).toContain("View claim");
  });
});

const payer = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
it.each(["approve_hold", "hold_expiring"] as const)(
  "only offers %s signing to its account",
  (kind) => {
    const hold: Action = {
      kind,
      payer,
      title: "Approve this hold",
      detail: null,
      href: "/app/approve/owned",
      tipId: "owned",
      source: "multibaas",
      amount: { micro: "1", usdc: "0.000001" },
    };
    for (const [agentWallet, actionPayer] of [
      [null, payer],
      [other, payer],
      [payer, null],
      [payer, undefined],
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(ActionQueue, {
          actions: [{ ...hold, payer: actionPayer }],
          agentWallet,
        }),
      );
      expect(html).not.toContain("Review &amp; sign");
      expect(html).not.toContain('href="/app/approve/owned"');
      expect(html).not.toContain("Approve this hold");
      expect(html).toContain("Awaiting account approval");
      expect(html).not.toContain("A signature from you");
    }
    const html = renderToStaticMarkup(
      createElement(ActionQueue, { actions: [hold], agentWallet: payer }),
    );
    expect(html).toContain('href="/app/approve/owned"');
    expect(html).toContain("Review &amp; sign");
  },
);
it("keeps maintainer claim links visible without an account", () => {
  const html = renderToStaticMarkup(
    createElement(ActionQueue, {
      actions: [
        {
          kind: "reserve_waiting",
          payer,
          title: "Waiting for maintainer",
          detail: null,
          href: "/app/npm/date-fns",
          package: "date-fns",
          source: "multibaas",
          amount: { micro: "1", usdc: "0.000001" },
        },
      ],
    }),
  );
  expect(html).toContain('href="/app/npm/date-fns"');
  expect(html).toContain("View claim");
  expect(html).not.toContain("Review &amp; sign");
});
