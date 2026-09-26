// Text for the `endcredits mcp` server (AGENTS.md rule 14): tool descriptions and tool results.
// Outcome reasons come from the stored credits, which are written from lib/messages.ts.
const NOT_THE_DECIDER =
  "The agent never decides who gets paid: every payee is screened by Intercepta and decided by the End Credits settler.";

export const MCP_COPY = {
  SERVER_NAME: "end-credits",
  TOOLS: {
    status: {
      title: "End Credits: estimate",
      description: `Show which open-source packages this Claude Code session used (role, score, signals) and an ESTIMATED split of the owner's session budget. Runs the local attribution; only the owner's budget settings are read from the server, nothing is uploaded. ${NOT_THE_DECIDER}`,
      sessionId: "Claude Code session id. Defaults to the most recently recorded session.",
    },
    roll: {
      title: "End Credits: roll credits",
      description: `Upload this session's attribution (if not uploaded yet) and ask the End Credits settler to settle it. Returns the server session id and the credits roll URL. Call end_credits_explain with that id about 30 seconds later. ${NOT_THE_DECIDER}`,
      sessionId: "Claude Code session id. Defaults to the most recently recorded session.",
    },
    explain: {
      title: "End Credits: explain outcome",
      description: `Explain what the settler decided for a rolled session: per package the outcome, amount, reasons, transaction links and, for held tips, the owner's approve link. Reports only what the server recorded. ${NOT_THE_DECIDER}`,
      sessionId: "The session id returned by end_credits_roll (or the Claude Code session id of a rolled session).",
    },
  },
  NO_SESSION: "No recorded End Credits session found. Is the endcredits hook installed (endcredits init)?",
  BAD_SESSION: "Not a valid session id: {id}",
  NO_LEDGER: "No ledger for session {id}. It may already be rolled; try end_credits_roll or end_credits_explain.",
  NOTHING_USED: "No installed packages were used in session {id}, so there is nothing to credit.",
  STATUS_HEADER: "Estimated split for session {id}: budget {budget} USDC, per-package cap {cap} USDC ({source}).",
  STATUS_SOURCE_OWNER: "owner settings",
  STATUS_SOURCE_DEFAULT: "estimate with default limits, the server was unreachable",
  STATUS_NOTE:
    "Estimate only. The settler applies the daily limit and screens every payee; held, refused or reserved credits are not paid out.",
  KEY_MISSING: "No agent key yet. Ask the owner to run: endcredits login",
  UPLOAD_FAILED: "Upload failed ({error}). The ledger is kept; try again later.",
  ROLL_REQUESTED: "Settlement requested for {id}. Watch it at {url}. Call end_credits_explain with sessionId {id} in about 30 seconds.",
  ROLL_ALREADY: "Session {id} is already rolling (or settled). Watch it at {url}. Call end_credits_explain with sessionId {id}.",
  ROLL_FAILED: "Uploaded as {id}, but the settle request failed ({error}). The owner can press Roll credits at {url}.",
  EXPLAIN_FAILED: "Could not read session {id} from the server ({error}).",
  EXPLAIN_NOT_FOUND: "No rolled session with id {id}.",
  EXPLAIN_STILL: "Not settled yet ({status}). Still screening: {packages}. Call end_credits_explain again shortly.",
  EXPLAIN_NONE: "No packages were credited in this session.",
  OUTCOMES: {
    paid: "paid",
    capped: "paid (capped)",
    held: "held for the owner",
    refused: "refused",
    reserved: "reserved for the maintainer",
    dust: "not sent (under 0.01 USDC)",
    screening: "still screening",
  },
  SUMMARY_HELD: "{count} held until the owner approves at {links}.",
} as const;

export type McpOutcome = keyof typeof MCP_COPY.OUTCOMES;
