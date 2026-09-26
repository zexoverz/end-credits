export const DESK = {
  activity: "Activity",
  controls: "Controls",
  packages: "Find a package",
  navigation: "Main workspace",
  viewsLabel: "Activity views",
  back: "Back to activity",
  eyebrow: "THE SESSION DESK",
  title: "Built with open source.\nAccounted for here.",
  subtitle:
    "Follow your agent’s sessions, the packages it used, and where each contribution goes.",
  controlTitle: "You set the boundaries.",
  connectTitle: "Your next session starts here.",
  connectBody:
    "Connect Claude Code once. Review its credits here after you build.",
  guideLabel: "A RECORD OF WHAT YOUR AGENT USED",
  steps: ["Signals", "Packages", "Credits"],
  views: [
    ["sessions", "Sessions"],
    ["decisions", "Decisions"],
    ["chain", "On-chain"],
  ],
  ledger: "Contribution ledger",
  ledgerBody: "Indexed escrow outcomes on Base Sepolia.",
  cast: "Packages in the credits",
  castHint: "Open the package ledger",
  lookup: "Have a session link?",
  scope: "Shared activity · Base Sepolia testnet",
  faqLabel: "A LITTLE MORE CONTEXT",
  faqTitle: "Good questions.\nClear answers.",
  faqBody:
    "What gets recorded, where the money goes, and what stays in your control.",
} as const;
