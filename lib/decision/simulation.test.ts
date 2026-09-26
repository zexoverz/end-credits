import { describe, expect, it } from "vitest";
import { msg } from "../messages";
import { applySimulation, type SimulationOutcome } from "./simulation";
import type { Decision } from "./types";

const PAYEE = "0xF233A42130Bcdd8b22FFB5D9593199f31C3Eeb87" as const;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const p = { payee: PAYEE, amount: BigInt(250_000) };
const paid: Decision = {
  outcome: "paid",
  reasons: [
    { source: "policy", code: "PAID", text: msg("PAID", { amount: "0.25" }) },
    { source: "intercepta", code: "SCREENED_AS", text: msg("SCREENED_AS") },
  ],
};

// The live answer for zod on 26 Sep (decisions.md), with its detector swapped per test.
function sim(over: { detectors?: { code: string; description: string }[]; assetsMovement?: unknown } = {}): SimulationOutcome {
  return {
    ok: true,
    data: {
      detectors: [],
      assetsMovement: { send: [{ symbol: "USDC", address: USDC, type: "ERC20", amount: "0.25" }], receive: [] },
      ...over,
    },
  };
}

describe("applySimulation", () => {
  it("keeps a clean exact payment paid and adds SIMULATED", () => {
    const d = applySimulation(paid, sim(), p);
    expect(d.outcome).toBe("paid");
    expect(d.reasons.map((r) => r.code)).toEqual(["PAID", "SCREENED_AS", "SIMULATED"]);
    expect(d.reasons[2].text).toBe(msg("SIMULATED", { amount: "0.25", payee: PAYEE }));
  });

  it("refuses on a refuse-on-sight detector, quoting it", () => {
    const d = applySimulation(paid, sim({ detectors: [{ code: "SCAM_ADDRESS", description: "Known scam address" }] }), p);
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0]).toEqual({
      source: "intercepta",
      code: "REFUSED_SIMULATION",
      text: "Refused. Intercepta flagged the simulated payment: Known scam address",
    });
    expect(d.reasons.map((r) => r.code)).not.toContain("PAID");
  });

  it("does not refuse on a detector outside the refuse-on-sight set", () => {
    const drainer = { code: "WALLET_DRAINER", description: "If you sign this transaction, you will send tokens or grant approval to a scam address." };
    expect(applySimulation(paid, sim({ detectors: [drainer] }), p).outcome).toBe("paid");
  });

  it("holds when the simulation moves a different amount", () => {
    const moved = { send: [{ symbol: "USDC", address: USDC, amount: "0.5" }], receive: [] };
    const d = applySimulation(paid, sim({ assetsMovement: moved }), p);
    expect(d).toMatchObject({ outcome: "held", holdReason: "SCREEN" });
    expect(d.reasons[0].text).toBe(`Held: the simulated payment moves -0.5 USDC instead of 0.25 USDC to ${PAYEE}.`);
  });

  it("holds when the simulation moves another token or receives something back", () => {
    const other = { send: [{ symbol: "USDC", address: "0x0000000000000000000000000000000000000001", amount: "0.25" }], receive: [] };
    expect(applySimulation(paid, sim({ assetsMovement: other }), p).outcome).toBe("held");
    const back = { send: [{ symbol: "USDC", address: USDC, amount: "0.25" }], receive: [{ symbol: "WETH", address: "0x2", amount: "1" }] };
    expect(applySimulation(paid, sim({ assetsMovement: back }), p).reasons[0].code).toBe("HELD_SIMULATION");
  });

  it("holds when nothing moves or the movement is missing", () => {
    const d = applySimulation(paid, sim({ assetsMovement: { send: [], receive: [] } }), p);
    expect(d.reasons[0].text).toContain("moves nothing instead of 0.25 USDC");
    expect(applySimulation(paid, sim({ assetsMovement: undefined }), p).outcome).toBe("held");
  });

  it("holds as SCREEN_UNAVAILABLE when the simulation failed", () => {
    const d = applySimulation(paid, { ok: false, error: "TIMEOUT" }, p);
    expect(d).toMatchObject({ outcome: "held", holdReason: "SCREEN" });
    expect(d.reasons[0]).toMatchObject({ code: "SCREEN_UNAVAILABLE", text: msg("SCREEN_UNAVAILABLE", { error: "TIMEOUT" }) });
  });

  it("applies to capped too and leaves other outcomes alone", () => {
    const capped: Decision = { outcome: "capped", reasons: [{ source: "policy", code: "CAPPED", text: "c" }] };
    expect(applySimulation(capped, { ok: false, error: "HTTP" }, p).outcome).toBe("held");
    const held: Decision = { outcome: "held", holdReason: "MEDIUM", reasons: [] };
    expect(applySimulation(held, { ok: false, error: "HTTP" }, p)).toBe(held);
  });
});
