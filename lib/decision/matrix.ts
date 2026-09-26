// The decision matrix (DESIGN §8, SPEC §7.3). Pure: first match wins, in this order. Every reason
// text comes from lib/messages.ts; Intercepta's trait and detector descriptions go in verbatim.
import { formatUnits } from "viem";
import { isPinnedUsdc, screenedAsReason } from "../intercepta/mapping";
import { msg, type MessageCode } from "../messages";
import type { Address, Decision, Reason, Screen } from "./types";

export type DecideInput = {
  pkg: string;
  payee: Address | null;
  paymentToken: Address;
  screen: Screen | null; // null only when payee is null
  capped: boolean;
  amount: bigint; // micro-USDC
  change: { changed: boolean; days?: number };
  lookalike: { of: Address; pkg: string } | null;
  spam: { count: number } | null;
  noCodeOnBase: boolean;
};

export const CRITICAL = new Set([
  "sanction_address",
  "known_scammer",
  "blacklist",
  "fake_phishing_transfer",
  // Simulation fallback detectors that name the recipient as malicious (decisions.md, E4).
  "SCAM_ADDRESS",
  "MALICIOUS_ADDRESS",
  "TRANSFER_TO_POISONING_ADDRESS",
  "POISONING_ATTACK",
]);

export const REFUSE_ABOVE = 50;
export const HOLD_FROM = 20;
export const SPAM_MIN = 5;

export function decide(i: DecideInput): Decision {
  const usdc = formatUnits(i.amount, 6);

  // 1. No payee: reserved, and never judged on a screen.
  if (i.payee === null) {
    return { outcome: "reserved", reasons: [policy("RESERVED", { amount: usdc, package: i.pkg })] };
  }

  const s = i.screen;
  const screened = s !== null && !s.error;
  const withNote = (d: Decision): Decision =>
    screened ? { ...d, reasons: [...d.reasons, screenedAsReason()] } : d;

  // 2. Token pin, then Intercepta's token verdict.
  if (!isPinnedUsdc(i.paymentToken)) return withNote(refused([policy("TOKEN_PIN")]));
  if (screened && s.tokenAction === "block") {
    const texts = s.tokenDetectors.length > 0 ? s.tokenDetectors.map((d) => d.description) : ["token action block"];
    return withNote(refused(texts.map(intercepta)));
  }

  // 3. No screen, no payment.
  if (!screened) {
    return {
      outcome: "held",
      holdReason: "SCREEN",
      reasons: [{ source: "intercepta", code: "SCREEN_UNAVAILABLE", text: msg("SCREEN_UNAVAILABLE", { error: s?.error ?? "NONE" }) }],
    };
  }

  // 4. Refusals.
  const critical = s.traits.filter((t) => CRITICAL.has(t.name));
  if (critical.length > 0) return withNote(refused(critical.map((t) => intercepta(t.description))));
  if (s.toxicScore > REFUSE_ABOVE) {
    const texts = s.traits.length > 0 ? s.traits.map((t) => t.description) : [`toxic score ${s.toxicScore}`];
    return withNote(refused(texts.map(intercepta)));
  }
  if (s.impersonation) {
    return withNote(
      refused([{ source: "intercepta", code: "IMPERSONATION", text: msg("IMPERSONATION", { original: s.impersonation.original }) }]),
    );
  }
  if (i.lookalike) {
    return withNote(
      refused([policy("LOOKALIKE", { address: i.payee, known: i.lookalike.of, knownPackage: i.lookalike.pkg })]),
    );
  }
  if (i.spam && i.spam.count >= SPAM_MIN) return withNote(refused([policy("SPAM", { count: i.spam.count })]));

  // 5. Recently changed funding address.
  if (i.change.changed) {
    const days = i.change.days ?? 0;
    const when = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
    const text = msg("HELD_CHANGED", { package: i.pkg, when });
    return withNote({ outcome: "held", holdReason: "ADDRESS_CHANGED", reasons: [{ source: "payee", code: "HELD_CHANGED", text }] });
  }

  // 6. Medium risk.
  if (s.toxicScore >= HOLD_FROM || s.tokenAction === "warn") {
    const text = msg("HELD_MEDIUM", { score: s.toxicScore });
    return withNote({ outcome: "held", holdReason: "MEDIUM", reasons: [{ source: "intercepta", code: "HELD_MEDIUM", text }] });
  }

  // 6b. No mainnet history: Intercepta answered, but had nothing to judge. Hold, never pay unscreened.
  if (s.noHistory) {
    const text = msg("HELD_NO_HISTORY", { address: i.payee });
    return withNote({ outcome: "held", holdReason: "MEDIUM", reasons: [{ source: "intercepta", code: "HELD_NO_HISTORY", text }] });
  }

  // 7. A contract that exists on Ethereum but not on Base.
  if (i.noCodeOnBase) {
    return withNote({ outcome: "held", holdReason: "NO_CODE", reasons: [policy("HELD_NO_CODE", { address: i.payee })] });
  }

  // 8. Pay.
  if (i.capped) return withNote({ outcome: "capped", reasons: [policy("CAPPED", { amount: usdc })] });
  return withNote({ outcome: "paid", reasons: [policy("PAID", { amount: usdc })] });
}

function refused(reasons: Reason[]): Decision {
  return { outcome: "refused", reasons };
}

function policy(code: MessageCode, vars: Record<string, string | number> = {}): Reason {
  return { source: "policy", code, text: msg(code, vars) };
}

function intercepta(description: string): Reason {
  return { source: "intercepta", code: "REFUSED_TRAIT", text: msg("REFUSED_TRAIT", { description }) };
}
