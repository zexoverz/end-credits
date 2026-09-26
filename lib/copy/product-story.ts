export const STORY = {
  eyebrow: "HOW END CREDITS WORKS",
  title: ["One session.", "A whole chain of thanks."],
  intro:
    "Follow the work from your AI agent to the people behind its packages. Every contribution has a budget, a decision, and a trail you can inspect.",
  example: "ILLUSTRATIVE WALKTHROUGH · NO LIVE PAYMENTS",
  auto: "Auto-playing · repeats",
  pause: "Pause walkthrough",
  resume: "Resume walkthrough",
  reduced: "Motion reduced",
  nav: "Explore the End Credits workflow",
  source: "Explore the implementation ↗",
  sourceUrl: "https://github.com/zexoverz/end-credits/tree/main/lib",
  footer:
    "Watch the full loop, or jump to any chapter. Amounts and packages here are illustrative.",
  chapters: [
    {
      name: "Observe",
      scope: "ON YOUR MACHINE",
      title: "Your agent builds. We follow the ingredients.",
      body: "Connect Claude Code with the CLI. Hooks quietly record package imports, reads, dependency additions, and documentation lookups. Your source code and repository paths stay local.",
      proof: "Silent hook · always exits 0",
      detail:
        "The MCP server also lets your agent inspect sessions and initiate settlement using your configured settings.",
    },
    {
      name: "Allocate",
      scope: "YOUR BUDGET, YOUR LIMITS",
      title: "Turn package signals into a fair share.",
      body: "A dependency added scores 5, an import 3, a documentation lookup 2, and a read 1. Repeated evidence is capped, then the weighted scores divide your session budget.",
      proof: "Session budget + package cap + daily limit",
      detail:
        "Your per-package cap limits each allocation. Any unused budget stays with you.",
    },
    {
      name: "Screen",
      scope: "BEFORE ANY SIGNATURE",
      title: "Find the payee. Check the counterparty.",
      body: "Resolve the wallet through verified claims, Drips, tea, or npm funding metadata. Intercepta screening joins address-change, lookalike, and spam checks to produce a stored decision.",
      proof: "Timeout, error, or no history → hold",
      detail:
        "A decision and its reasons must be recorded before any payment authorization or escrow transaction is built.",
    },
    {
      name: "Route",
      scope: "BASE SEPOLIA · TESTNET USDC",
      title: "Every outcome has its own next step.",
      body: "Cleared allocations use x402. Credits needing review are held in escrow; packages without a wallet receive a reserve. Refused and skipped credits are not sent.",
      proof: "Payee, USDC, network, and amount checked",
      detail:
        "A 402 challenge must match the screened payee, pinned USDC, eip155:84532, and the allocation before signing. A decision alone does not prove payment.",
    },
    {
      name: "Resolve",
      scope: "OWNER + MAINTAINER",
      title: "Automation, with people in control.",
      body: "Owners review held credits and sign releases with their approver wallet, with World ID step-up where required. Maintainers can claim reserves by proving repository ownership.",
      proof: "Deny or expire a hold → refund to payer",
      detail:
        "The maintainer flow uses GitHub sign-in, a payout wallet, and a merged claim PR. The on-chain activation delay is shown before funds become claimable.",
    },
    {
      name: "Verify",
      scope: "THE END CREDITS",
      title: "See what happened. And why.",
      body: "The session’s credits roll brings package attribution, outcomes, reasons, and transaction links together. Curvegrid’s MultiBaas indexes escrow and USDC events for the activity view.",
      proof: "Transaction evidence, separate from decisions",
      detail:
        "Follow payments, holds, claims, releases, and refunds. A transaction hash appears only when the backend has execution evidence.",
    },
  ],
  capture: {
    agent: "Claude Code",
    task: "Build a checkout flow",
    hook: "End Credits hook",
    local: "CODE STAYS LOCAL",
    signals: ["dependency added", "package imported", "docs consulted"],
    upload: "Attribution signals → session",
    package: "@endcredits-demo/schema",
  },
  allocation: {
    label: "YOUR SESSION BUDGET",
    total: "1.00",
    unit: "USDC",
    cap: "Example cap · 0.50 USDC",
    scores: [
      { name: "schema", score: "5", amount: "0.50", width: 50 },
      { name: "format", score: "3", amount: "0.30", width: 30 },
      { name: "unclaimed", score: "2", amount: "0.20", width: 20 },
    ],
    namespace: "@endcredits-demo/*",
    formula: "weighted share → per-package cap",
  },
  screen: {
    wallet: "RESOLVED PAYOUT WALLET",
    address: "0x… · illustrative payee",
    checks: ["Address screening", "Token risk", "Impersonation checks"],
    stored: "Decision + reasons stored",
    gate: "SIGNATURE GATE",
    note: "No stored decision → no signature",
  },
  routes: [
    {
      name: "Cleared",
      path: "x402 → payee",
      note: "Paid / capped",
      tone: "mint",
    },
    {
      name: "Needs review",
      path: "Escrow → owner",
      note: "Held",
      tone: "paper",
    },
    {
      name: "No wallet",
      path: "Reserve → maintainer",
      note: "Reserved",
      tone: "ink",
    },
  ],
  routeLabel: "A STORED DECISION ROUTES EACH CREDIT",
  routeFoot: "Refused / skipped → no transfer",
  resolve: {
    owner: "OWNER",
    ownerTitle: "Review a hold",
    ownerSteps: [
      "Inspect the reason",
      "Sign with approver wallet",
      "Step-up if required",
    ],
    maintainer: "MAINTAINER",
    maintainerTitle: "Claim a reserve",
    maintainerSteps: [
      "Verify GitHub ownership",
      "Merge the wallet claim PR",
      "Wait for activation",
    ],
    ownerEnd: "Release or refund",
    maintainerEnd: "Claim to verified wallet",
  },
  receipt: {
    label: "SESSION RECEIPT",
    title: "The credits go to…",
    head: ["Package", "Decision", "Evidence"],
    rows: [
      { name: "schema", outcome: "Paid", evidence: "Transfer receipt" },
      { name: "format", outcome: "Held", evidence: "Escrow record" },
      { name: "unclaimed", outcome: "Reserved", evidence: "Reserve record" },
    ],
    event: "MultiBaas event index",
    foot: "Illustrative records · inspect real receipts in the app",
  },
} as const;

export const INTEGRATIONS = {
  eyebrow: "THE INTEGRATIONS BEHIND THE CREDITS",
  title: "Purpose-built checks. Verifiable execution.",
  body: "Each integration has a specific job in the contribution flow.",
  items: [
    {
      name: "Intercepta",
      logo: "intercepta",
      url: "https://intercepta.io",
      role: "SCREENING",
      title: "Check before signing.",
      body: "Counterparty, token, and impersonation screening informs each credit’s decision. Screening failures put contributions on hold.",
    },
    {
      name: "Curvegrid",
      logo: "curvegrid",
      url: "https://www.curvegrid.com/multibaas",
      role: "ON-CHAIN VISIBILITY",
      title: "Follow the funds with MultiBaas.",
      body: "Escrow and USDC event queries, plus webhooks, bring blockchain activity into the dashboard.",
    },
  ],
  event: "Built at ETHGlobal Tokyo 2026",
  eventNote: "An open-source hackathon project on Base Sepolia.",
  eventUrl: "https://ethglobal.com/events/tokyo2026",
  ethglobal: "ETHGlobal",
} as const;
