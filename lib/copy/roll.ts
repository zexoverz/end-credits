// Copy for `/credits/[id]` (AGENTS.md rule 14). ROLL_TITLE and NOT_A_PAYWALL live in lib/messages.ts.
export const ROLL_COPY = {
  ROLES: {
    starring: "Starring",
    featuring: "Featuring",
    research: "Research",
    thanks: "Special thanks",
  },
  SIGNALS: {
    dep_added: "added as a dependency",
    import: "import",
    docs: "docs",
    read: "read",
  },
  SIGNAL_LINE: "{signal} · {count}",
  PROJECT: { one: "project", many: "projects" },
  TOTALS_PAID: "Paid {amount} USDC to {count} {projects}.",
  TOTALS_HELD: "Held {amount} USDC.",
  TOTALS_RESERVED: "Reserved {amount} USDC for {count} {projects} without a wallet.",
  TOTALS_REFUSED: "Refused {count}.",
  LOADING: "Loading the credits…",
  NOT_FOUND: "No session with this id.",
  NETWORK: "Could not reach the server ({error}). Retrying.",
  EMPTY: "No packages were credited in this session.",
  STATUS: {
    uploaded: "Waiting to roll.",
    settling: "Rolling. Each payee is screened before anything is signed.",
    settled: "Settled.",
    failed: "Settling failed.",
  },
  ROLL_BUTTON: "Roll credits",
  ROLL_REQUESTED: "Rolling requested. The settler picks it up in a moment.",
  ROLL_SIGN_IN: "Sign in as the owner to roll these credits.",
  ROLL_SIGN_IN_LINK: "Owner sign-in",
  ROLL_FORBIDDEN: "Only the owner of this session can roll its credits.",
  ROLL_CONFLICT: "These credits are already rolling.",
  ROLL_FAILED: "Could not start the roll ({error}).",
  TX_LINK: "tx on Basescan",
  RECORD_LINK: "session record on Basescan",
} as const;

export type RollRole = keyof typeof ROLL_COPY.ROLES;
