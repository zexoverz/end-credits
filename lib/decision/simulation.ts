// The payment simulation, read after the matrix and before any signature (decisions.md, simulate
// the payment). Only a paid or capped decision is simulated. A detector in the refuse-on-sight set
// refuses; any movement other than exactly -amount USDC from the sender holds; an error holds.
import { formatUnits, parseUnits } from "viem";
import { z } from "zod";
import { BASE_USDC, sameAddress } from "../intercepta/mapping";
import { msg } from "../messages";
import { CRITICAL } from "./matrix";
import type { Address, Decision, Reason, ScreenError } from "./types";

export type SimulationOutcome =
  | { ok: true; data: { detectors: { code: string; description: string }[]; assetsMovement?: unknown } }
  | { ok: false; error: ScreenError };

const Asset = z.object({ symbol: z.string(), address: z.string(), amount: z.string() });
const Movement = z.object({ send: z.array(Asset), receive: z.array(Asset) });
type Asset = z.infer<typeof Asset>;

const PAYING = new Set(["paid", "capped"]);

export function applySimulation(d: Decision, sim: SimulationOutcome, p: { payee: Address; amount: bigint }): Decision {
  if (!PAYING.has(d.outcome)) return d;
  const usdc = formatUnits(p.amount, 6);
  const rest = d.reasons.filter((r) => r.code !== "PAID" && r.code !== "CAPPED");

  if (!sim.ok) {
    const text = msg("SCREEN_UNAVAILABLE", { error: sim.error });
    return { outcome: "held", holdReason: "SCREEN", reasons: [reason("SCREEN_UNAVAILABLE", text), ...rest] };
  }

  const flagged = sim.data.detectors.filter((x) => CRITICAL.has(x.code));
  if (flagged.length > 0) {
    const reasons = flagged.map((x) => reason("REFUSED_SIMULATION", msg("REFUSED_SIMULATION", { description: x.description })));
    return { outcome: "refused", reasons: [...reasons, ...rest] };
  }

  const moved = movedOf(sim.data.assetsMovement, p.amount);
  if (moved !== null) {
    const text = msg("HELD_SIMULATION", { moved, amount: usdc, payee: p.payee });
    return { outcome: "held", holdReason: "SCREEN", reasons: [reason("HELD_SIMULATION", text), ...rest] };
  }

  return { ...d, reasons: [...d.reasons, reason("SIMULATED", msg("SIMULATED", { amount: usdc, payee: p.payee }))] };
}

// null when the simulation sends exactly `amount` Base USDC and receives nothing; else what it moved.
function movedOf(raw: unknown, amount: bigint): string | null {
  const parsed = Movement.safeParse(raw);
  if (!parsed.success) return "an unreadable asset movement";
  const { send, receive } = parsed.data;
  const exact = send.length === 1 && receive.length === 0 && isUsdc(send[0]) && units(send[0].amount) === amount;
  if (exact) return null;
  const parts = [
    ...send.map((a) => `-${a.amount} ${a.symbol}`),
    ...receive.map((a) => `+${a.amount} ${a.symbol}`),
  ];
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

function isUsdc(a: Asset): boolean {
  return sameAddress(a.address, BASE_USDC);
}

function units(amount: string): bigint | null {
  try {
    return parseUnits(amount, 6);
  } catch {
    return null;
  }
}

function reason(code: "SCREEN_UNAVAILABLE" | "REFUSED_SIMULATION" | "HELD_SIMULATION" | "SIMULATED", text: string): Reason {
  return { source: "intercepta", code, text };
}
