import { describe, expect, it } from "vitest";
import { inboxItems } from "@/components/product/action-inbox";
import type { Action } from "@/lib/multibaas/actions";
const hold: Action = {
  kind: "approve_hold",
  tipId: "0xabc",
  package: "@endcredits-demo/review",
  payee: null,
  expiresAt: "2026-09-26T23:00:00Z",
  title: "Review funding change",
  detail: "Address changed",
  href: "/app/approve/0xabc",
  amount: { micro: "250000", usdc: "0.25" },
  source: "multibaas",
};
const warning: Action = {
  ...hold,
  kind: "hold_expiring",
  title: "Expires soon",
};
describe("action inbox", () => {
  it.each([
    [hold, warning],
    [warning, hold],
  ])(
    "keeps one actionable hold and its expiry explanation regardless of ordering",
    (first, second) => {
      const items = inboxItems([first, second]);
      expect(items).toHaveLength(1);
      expect(items[0].action).toBe(hold);
      expect(items[0].warning).toBe(warning);
      expect(items[0].action.amount.micro).toBe("250000");
      expect(items[0].action.href).toBe("/app/approve/0xabc");
    },
  );
  it("never combines different holds, unidentified tips or package reserves", () => {
    const other = { ...hold, tipId: "0xdef" };
    const unknown = { ...hold, tipId: undefined };
    const reserve: Action = {
      kind: "reserve_waiting",
      package: hold.package,
      packageKey: "0xabc",
      sessions: 1,
      title: "Claim reserve",
      detail: null,
      href: "/app/npm/@endcredits-demo/review",
      amount: hold.amount,
      source: "multibaas",
    };
    const items = inboxItems([hold, other, unknown, unknown, reserve]);
    expect(items.map((x) => x.action)).toEqual([
      hold,
      other,
      unknown,
      unknown,
      reserve,
    ]);
  });
});
