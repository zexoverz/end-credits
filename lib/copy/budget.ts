// Copy for the budget wallet component (components/budget/*, EndCreditsBudget; AGENTS.md rule 14).
export const BUDGET_COPY = {
  SLIDER: "Spending limit per period",
  SLIDER_HELP:
    "The contract enforces this cap. Your session, package and daily contribution rules can be lower.",
  RANGE: "Slider range",
  RANGE_MORE: "Increase slider range",
  RANGE_LESS: "Decrease slider range",
  APPROVAL_READY: "USDC approval covers this amount.",
  APPROVAL_REQUIRED:
    "Approve this amount first, then wait for confirmation or refresh.",
  STEP_AMOUNT: "{amount} USDC",
  HOURS: "{hours} hours",
  BAD_PERIOD: "Choose a period from 1 hour to 30 days.",
  NOT_READY: "Wallet details are unavailable. Refresh before continuing.",
  UNKNOWN: "Unavailable",
  APPROVE_STEP: "01 / Approve your USDC",
  APPROVE_HELP:
    "Let the budget contract access this amount. Your USDC stays in your wallet until a session spends it.",
  ALLOWANCE_STEP: "02 / Set spending limit",
  ALLOWANCE_HELP:
    "Choose how much the agent can spend each period. You can lower or revoke this permission.",
  REFRESH: "Refresh spending limit",
  TITLE: "Spending limit",
  EXPLAIN:
    "Your USDC stays in your own wallet. You approve USDC to the budget contract and let your Agent wallet pull at most a set amount per period. The Agent wallet is unique to your account. It only pulls within this limit and returns any leftover to your wallet when the session ends. Lower or revoke the limit any time.",
  NOT_CONFIGURED: "Spend limits are not switched on for this server yet.",
  WALLET: "Budget wallet",
  NONE: "none",
  SPENDER: "Agent wallet",
  BALANCE: "USDC in the wallet",
  APPROVED: "USDC approved to the budget contract",
  ALLOWANCE: "Spending limit",
  ALLOWANCE_LINE:
    "{perPeriod} USDC per {period}, {spent} spent this period, {remaining} left",
  NO_ALLOWANCE: "No spending limit yet. Nothing can be pulled.",
  RPC: "Could not read the chain right now.",
  CONNECT: "Connect MetaMask",
  CONNECTING: "Opening wallet…",
  CONNECTED: "Connected",
  USE_WALLET: "Use this wallet as the budget wallet",
  WRONG_WALLET:
    "Connect the budget wallet {budgetOwner} to change its spending limit; this is {address}.",
  PER_PERIOD: "Per period (USDC)",
  PERIOD: "Period",
  PERIODS: { "3600": "hour", "86400": "day", "604800": "week" } as Record<
    string,
    string
  >,
  APPROVE_AMOUNT: "Approve (USDC)",
  APPROVE: "Approve USDC",
  SET_ALLOWANCE: "Set spending limit",
  REVOKE: "Revoke spending limit",
  CONFIRM: "Confirm in your wallet…",
  SENT: "Sent. It shows here once the block lands.",
  SAVED: "Budget wallet saved.",
  BAD_AMOUNT:
    "Choose a spending limit greater than zero, with at most 6 decimal places.",
  FAILED: "Did not go through ({error}).",
  LOAD_FAILED: "Could not read the budget wallet ({error}).",
} as const;
