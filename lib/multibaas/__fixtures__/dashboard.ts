// Fixture MultiBaas saved-query results and a fake repo for the dashboard tests. Test-only.
import { vi } from "vitest";
import { MultiBaasError, type MultiBaasClient } from "../client";
import type { DashboardRepo } from "../dashboard";

export const PAYER = "0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6";
export const ESCROW = "0x1111111111111111111111111111111111111111";
const A = "0x2222222222222222222222222222222222222222";
const B = "0x3333333333333333333333333333333333333333";

const k = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
export const K1 = k(0xa1);
export const K2 = k(0xa2);
export const K3 = k(0xa3);
export const K4 = k(0xa4);
export const S1 = k(0x51);
export const S2 = k(0x52);
const tip = (n: number) => k(0x700 + n);
const tx = (n: number) => k(0x900 + n);
export const T1 = tx(1);
export const T3 = tx(3);

const HELD = "Held(bytes32,bytes32,address,address,uint256,uint8,uint64)";
const RELEASED = "Released(bytes32,address,uint256,bytes32)";
const REFUNDED = "Refunded(bytes32,address,uint256,bool)";

export const RESULTS: Record<string, { rows: Record<string, unknown>[] }> = {
  paid_totals: {
    rows: [
      { contract: "usdc", sender: PAYER.toLowerCase(), recipient: A, amount: "250000", block: 12, tx: T1, at: "2026-09-26T01:00:00Z" },
      // payer funding a hold: goes to the escrow, not to a maintainer
      { contract: "usdc", sender: PAYER, recipient: ESCROW, amount: "100000", block: 13, tx: tx(2), at: "2026-09-26T01:01:00Z" },
      { contract: "usdc", sender: PAYER, recipient: B, amount: 50000, block: 14, tx: T3, at: "2026-09-26T01:02:00Z" },
      // another linked token with a Transfer event
      { contract: "othertoken", sender: PAYER, recipient: A, amount: "999", block: 15, tx: tx(4), at: "2026-09-26T01:03:00Z" },
    ],
  },
  held_status: {
    rows: [
      { event: HELD, tip_id: tip(1), amount: "300000", detail: "1790000000", block: 20, tx: tx(10) },
      { event: HELD, tip_id: tip(2), amount: "200000", detail: "1790000000", block: 20, tx: tx(10) },
      { event: HELD, tip_id: tip(3), amount: "100000", detail: "1790000000", block: 20, tx: tx(10) },
      { event: HELD, tip_id: tip(4), amount: "70000", detail: "1790000000", block: 21, tx: tx(11) },
      { event: RELEASED, tip_id: tip(1), amount: "300000", detail: k(0xee), block: 22, tx: tx(12) },
      { event: REFUNDED, tip_id: tip(2), amount: "200000", detail: false, block: 23, tx: tx(13) },
      { event: REFUNDED, tip_id: tip(3), amount: "100000", detail: "true", block: 24, tx: tx(14) },
    ],
  },
  reserved_by_package: {
    rows: [
      { package_key: K3, amount: "400000" },
      { package_key: K4, amount: "0" },
    ],
  },
  reserved_sessions: {
    rows: [
      { package_key: K3, session_id: S1, amount: "300000", block: 30, tx: tx(20) },
      { package_key: K3, session_id: S2, amount: "100000", block: 31, tx: tx(21) },
      { package_key: K4, session_id: S1, amount: "50000", block: 30, tx: tx(20) },
    ],
  },
  sessions: {
    rows: [
      { session_id: S1, budget: "2000000", paid: "250000", held: "600000", reserved: "350000", refused: "0", block: 40, tx: tx(30), at: "2026-09-26T02:00:00Z" },
      { session_id: S2, budget: "2000000", paid: "50000", held: "70000", reserved: "100000", refused: "10000", block: 41, tx: tx(31), at: "2026-09-26T03:00:00Z" },
    ],
  },
  recent: {
    rows: [
      { event: "SessionSettled(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,bytes32)", subject: S2, amount: "50000", block: 41, tx: tx(31), at: "2026-09-26T03:00:00Z" },
      { event: REFUNDED, subject: tip(3), amount: "100000", block: 24, tx: tx(14), at: "2026-09-26T01:30:00Z" },
    ],
  },
};

export type FakeMb = MultiBaasClient & { get: ReturnType<typeof vi.fn> };

/** Serves RESULTS by label; `overrides` swap one label's result or make it throw. */
export function fakeMultiBaas(overrides: Record<string, unknown> = {}): FakeMb {
  return {
    get: vi.fn(async (path: string) => {
      const label = /^\/queries\/([^/]+)\/results/.exec(path)?.[1];
      if (!label) throw new Error(`unexpected path ${path}`);
      const o = overrides[label];
      if (o instanceof Error) throw o;
      return o ?? RESULTS[label];
    }),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  } as FakeMb;
}

export const unreachable = () =>
  new MultiBaasError("MultiBaas GET /queries/paid_totals/results: fetch failed", "network");

export function fakeDashboardRepo(): DashboardRepo {
  const names: Record<string, string> = {
    [K1]: "zod",
    [K2]: "viem",
    [K3]: "@endcredits-demo/unclaimed-utils",
    [K4]: "@endcredits-demo/claimed-kit",
  };
  return {
    packageNames: vi.fn(async (keys: string[]) => new Map(keys.filter((x) => names[x]).map((x) => [x, names[x]]))),
    creditsByTx: vi.fn(async () => [
      { txHash: T1, packageKey: K1, sessionKey: S1 },
      { txHash: T3, packageKey: K2, sessionKey: S2 },
    ]),
    refusedCount: vi.fn(async () => 3),
    lastDecisions: vi.fn(async () => [
      { packageKey: K1, outcome: "paid", decidedAt: new Date("2026-09-26T01:00:00Z") },
      { packageKey: K3, outcome: "reserved", decidedAt: new Date("2026-09-26T01:05:00Z") },
    ]),
  };
}
