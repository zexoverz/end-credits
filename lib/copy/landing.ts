// Copy for / (AGENTS rule 14). NOT_A_PAYWALL lives in lib/messages.ts and is reused, not copied.
// The measurement is SPEC §6.1 (scripts/measure-funding.py, 25 Sep 2026); change both together.
export const REPO_URL = "https://github.com/zexoverz/end-credits";
export const ESCROW_ADDRESS = "0x63047583FbCe241D72d71137C940aa27BBdC60f1";

export const LANDING = {
  NAME: "End Credits",
  ONE_LINE:
    "Your AI agent pays every open-source project it used, and never pays the scammers pretending to be them.",

  STEPS_TITLE: "How it works",
  STEP_1_TITLE: "Install the hook",
  STEP_1_BODY:
    "Run endcredits init once. A Claude Code hook records which packages your agent reads, imports and installs. No code or repo paths leave your machine.",
  STEP_2_TITLE: "Your agent works",
  STEP_2_BODY:
    "At the end of the session, your budget is split across the packages by how much the agent used them, and every payee is screened by Intercepta before anything is signed.",
  STEP_3_TITLE: "Credits roll",
  STEP_3_BODY: "Each package gets one outcome:",
  OUTCOMES: [
    { outcome: "paid", line: "Clean payee: paid in USDC over x402, straight to the maintainer." },
    { outcome: "held", line: "A doubt: kept in escrow until you approve with World ID, refunded on deny or expiry." },
    { outcome: "refused", line: "High risk, a lookalike or a spam pattern: nothing is sent." },
    { outcome: "reserved", line: "No wallet listed: kept in escrow under the package until the maintainer claims it." },
  ],

  MEASURE_TITLE: "Why reserve",
  MEASURE_SCOPE: "Top 1,000 npm packages, measured 25 Sep 2026.",
  MEASURE_ANY_VALUE: "41.6%",
  MEASURE_ANY: "have any funding metadata.",
  MEASURE_WALLET_VALUE: "2.1%",
  MEASURE_WALLET: "list a wallet an agent can pay (21 packages, 10 repositories).",
  MEASURE_READING: "Four in ten ask for money; one in fifty can receive it. The rest is reserved until the maintainer claims.",

  TRY_TITLE: "Try it",
  TRY_INTRO: "From a clone of the repository:",
  TRY_KEY_NOTE: "Create the agent key on the Owner page.",
  TRY_COMMANDS: ["pnpm --filter endcredits build", "endcredits init", "endcredits key <token>"],

  LINKS_TITLE: "Look around",
  LINK_DASHBOARD: "Dashboard: every amount from MultiBaas",
  LINK_HISTORY: "History: every decision and its reasons",
  LINK_REPO: "Source on GitHub",
  LINK_ESCROW: "Escrow contract on Basescan",
} as const;
