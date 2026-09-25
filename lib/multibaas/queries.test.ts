import { describe, expect, it } from "vitest";
import { QUERY_LABELS, savedQueries, type EventQuery } from "./queries";

const PAYER = "0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6";

describe("saved event queries", () => {
  const all = savedQueries(PAYER);

  it("defines every label the dashboard reads", () => {
    expect(Object.keys(all).sort()).toEqual(Object.values(QUERY_LABELS).sort());
  });

  it("aggregated queries leave exactly one field unaggregated, and group by it", () => {
    for (const [label, q] of Object.entries(all) as [string, EventQuery][]) {
      const aggregated = q.events.some((e) => e.select.some((f) => f.aggregator));
      if (!aggregated) {
        expect(q.groupBy, label).toBeUndefined();
        continue;
      }
      for (const e of q.events) {
        const plain = e.select.filter((f) => !f.aggregator);
        expect(plain.length, label).toBe(1);
        expect(plain[0].alias, label).toBe(q.groupBy);
      }
    }
  });

  it("uses lowercase aliases and the same alias set for every event of a query", () => {
    for (const [label, q] of Object.entries(all) as [string, EventQuery][]) {
      const sets = q.events.map((e) => e.select.map((f) => f.alias).join(","));
      expect(new Set(sets).size, label).toBe(1);
      for (const e of q.events) {
        for (const f of e.select) expect(f.alias, label).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it("never nests filters (nested AND is unverified)", () => {
    for (const q of Object.values(all)) {
      for (const e of q.events) expect(e.filter?.children).toBeUndefined();
    }
  });

  it("filters paid_totals on the checksummed payer as Transfer.from", () => {
    const f = all.paid_totals.events[0].filter;
    expect(f).toEqual({ fieldType: "input", inputIndex: 0, operator: "equal", value: PAYER });
  });

  it("reserved_by_package adds Reserved and subtracts Claimed", () => {
    const [reserved, claimed] = all.reserved_by_package.events;
    expect(reserved.eventName).toBe("Reserved");
    expect(reserved.select.find((f) => f.alias === "amount")?.aggregator).toBe("add");
    expect(claimed.eventName).toBe("Claimed");
    expect(claimed.select.find((f) => f.alias === "amount")?.aggregator).toBe("subtract");
  });
});
