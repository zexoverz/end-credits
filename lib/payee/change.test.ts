import { describe, expect, it } from "vitest";
import { memoryStore } from "./__fixtures__/memory-store";
import { recentlyChanged } from "./change";
import type { Observation } from "./observe";

const A = "0xD5371B61b35E13F2ae354BE95081aD63FB383452";
const B = "0x3A39F5E9BFe0a90e394982492e166C5635893141";
const NOW = new Date("2026-09-26T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const obs = (address: string, d: number, packageId = "p"): Observation => ({
  packageId,
  address,
  source: "drips",
  sourceUrl: "https://raw.githubusercontent.com/x/y/HEAD/FUNDING.json",
  observedAt: daysAgo(d),
});

describe("recentlyChanged", () => {
  it("a different address seen inside 30 days is a change, dated from the new address", async () => {
    const store = memoryStore([obs(A, 20), obs(A, 10), obs(B, 9), obs(B, 1)]);
    expect(await recentlyChanged(store, "p", B, { now: NOW })).toEqual({ changed: true, days: 9 });
  });

  it("a change seen only now is 0 days old", async () => {
    const store = memoryStore([obs(A, 3), obs(B, 0)]);
    expect(await recentlyChanged(store, "p", B, { now: NOW })).toEqual({ changed: true, days: 0 });
  });

  it("a different address last seen over 30 days ago is not a change", async () => {
    const store = memoryStore([obs(A, 45), obs(A, 31), obs(B, 30.5), obs(B, 2)]);
    expect(await recentlyChanged(store, "p", B, { now: NOW })).toEqual({ changed: false, days: 0 });
  });

  it("the same address throughout is not a change", async () => {
    const store = memoryStore([obs(B, 20), obs(B, 5), obs(B, 0)]);
    expect(await recentlyChanged(store, "p", B, { now: NOW })).toEqual({ changed: false, days: 0 });
  });

  it("compares addresses case-insensitively", async () => {
    const store = memoryStore([obs(B.toLowerCase(), 5)]);
    expect((await recentlyChanged(store, "p", B, { now: NOW })).changed).toBe(false);
  });

  it("ignores other packages", async () => {
    const store = memoryStore([obs(A, 5, "other"), obs(B, 1)]);
    expect((await recentlyChanged(store, "p", B, { now: NOW })).changed).toBe(false);
  });
});
