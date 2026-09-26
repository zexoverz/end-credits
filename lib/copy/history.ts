// Copy for `/history` (AGENTS.md rule 14). SCREENED_AS comes from the API (lib/messages.ts).
export const HISTORY_COPY = {
  TITLE: "Every decision, explained.",
  INTRO:
    "The latest 200 decisions, newest first. Inspect the attribution, screening, and transaction behind each credit.",
  REFRESH: "Refresh",
  LOADING: "Loading…",
  EMPTY: "No credits decided yet.",
  ERROR: "Could not load the history ({error}).",
  COLS: {
    time: "Decided",
    package: "Package",
    outcome: "Outcome",
    amount: "Amount",
    reasons: "Reasons",
    screens: "Screens",
    hold: "Hold",
    tx: "Tx",
  },
  CAPPED: "capped",
  SESSION_LINK: "View session ↗",
  SCREEN_LINE: "{kind} · HTTP {status} · {latency} ms",
  NO_SCREENS: "none",
  HOLD_LINE: "{status}, expires {expiresAt}",
  RELEASE_TX: "release tx",
  REFUND_TX: "refund tx",
  TX_LINK: "Basescan",
} as const;
