// Shapes shared by the decision matrix and the Intercepta client (DESIGN §8).
import type { MessageCode } from "../messages";

export type Address = `0x${string}`;

export type Reason = {
  source: "intercepta" | "policy" | "payee";
  code: MessageCode;
  text: string;
};

export type ScreenError = "TIMEOUT" | "HTTP" | "PARSE";

export type Screen = {
  toxicScore: number;
  traits: { name: string; description: string }[];
  tokenAction: "block" | "warn" | "info";
  tokenDetectors: { code: string; description: string }[];
  // Intercepta's address-impersonation check (decisions.md, E4). null when clean.
  impersonation?: { original: string } | null;
  error?: ScreenError;
  // `screens` rows this screen was built from, for credits.screen_ids.
  screenIds?: string[];
};

export type HoldReason = "ADDRESS_CHANGED" | "MEDIUM" | "SCREEN" | "NO_CODE";

// On-chain `uint8 reason` for EndCreditsEscrow.hold (DESIGN §8).
export const HOLD_REASON_CODE: Record<HoldReason, number> = {
  ADDRESS_CHANGED: 1,
  MEDIUM: 2,
  SCREEN: 3,
  NO_CODE: 4,
};

export type Outcome = "paid" | "capped" | "held" | "refused" | "reserved";

export type Decision = { outcome: Outcome; reasons: Reason[]; holdReason?: HoldReason };
