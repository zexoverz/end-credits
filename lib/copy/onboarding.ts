export const SETUP_STEPS = [
  {
    id: "signed_in",
    title: "Sign in",
    body: "Sign a message with MetaMask. This signs you in without sending a transaction.",
    action: "Sign in with your wallet",
    href: "/app/owner#identity",
  },
  {
    id: "wallet_bound",
    title: "Your wallet",
    body: "Any MetaMask account can sign in. Its first sign-in creates your account automatically. This wallet is your sign-in, approver and funding wallet by default.",
    action: "Check your identity",
    href: "/app/owner#identity",
  },
  {
    id: "budget_set",
    title: "Review your budget",
    body: "Defaults are already saved. Review your session budget, per-package cap and daily limit before your first session.",
    action: "Review budget",
    href: "/app/owner#budget",
  },
  {
    id: "approver_set",
    title: "Check your approver",
    body: "Your sign-in wallet becomes your approver automatically, usually within about 5 seconds. Later changes may have an on-chain activation delay.",
    action: "Review approver",
    href: "/app/owner#approver",
  },
  {
    id: "spend_allowance",
    title: "Set a spending limit",
    body: "Choose a spending limit. From your wallet, approve USDC to the budget contract, then confirm the Agent wallet’s limit per hour, day or week. Both steps must be confirmed on chain.",
    action: "Set spending limit",
    href: "/app/owner#allowance",
  },
  {
    id: "agent_key",
    title: "Connect your agent",
    body: "Create a connection key. Run endcredits key <token> on your machine, then endcredits init inside your project.",
    action: "Create a connection key",
    href: "/app/owner#keys",
  },
  {
    id: "first_session",
    title: "Record your first session",
    body: "After setup, run a Claude Code session in your project. End Credits records the packages it used; open the session to inspect its credits.",
    action: "View agent setup",
    href: "/app/owner#keys",
  },
] as const;
export const ONBOARDING = {
  eyebrow: "YOUR ACCOUNT / SETUP & CONTROLS",
  title: "Set the rules.\nLet your agent build.",
  subtitle: "One guided setup. Your wallet, your limits, your permission.",
  passport: "YOUR ACCOUNT",
  passportBody:
    "A wallet opens your workspace. A few deliberate choices make it yours.",
  signInTitle: "Sign in with your wallet",
  signInBody:
    "Sign in with your MetaMask account. If it is new to End Credits, your account is created automatically. Your existing wallet holds your funds; you do not need to create another wallet.",
  messageOnly: "Message signature only. No transfer or spend permission.",
  statement: "Sign in to End Credits",
  metamask: "Continue with MetaMask",
  metamaskHint: "Browser wallet",
  noExtension:
    "MetaMask is not available. Install the MetaMask extension and reload this page.",
  methodsLoading: "Loading sign-in options…",
  methodsError: "Sign-in options could not be loaded. Please retry.",
  unavailable: "Wallet sign-in is not enabled on this server.",
  dev: "Developer access",
  retry: "Try again",
  cancel: "Cancel sign-in",
  cancelled: "Sign-in cancelled. Nothing was submitted to the server.",
  stages: {
    nonce: "Preparing a fresh sign-in request…",
    connect: "Choose your account in the wallet…",
    sign: "Review and sign the message in your wallet…",
    verify: "Verifying your signature with the server…",
  },
  checklist: "Your setup itinerary",
  checklistBody:
    "Seven checkpoints, read directly from your account. Pick any step to review it.",
  progress: "complete",
  next: "UP NEXT",
  completeTitle: "Your setup is complete.",
  completeBody: "Open your latest session, or review your controls below.",
  activity: "Open activity ↗",
  check: "Refresh checklist",
  checking: "Checking setup…",
  checklistFailed:
    "Could not read your setup checklist. Your controls are still available below.",
  sessionExpired: "Your session has ended. Sign in again to continue.",
  done: "Done",
  todo: "To do",
  current: "Next",
  unknown: "Status unavailable",
  soon: "Coming soon",
  guideTitle: "From wallet to first session.",
  guideBody: "The same seven checkpoints you’ll find in your control room.",
  sections: "Jump to a control",
  budget: "Budget",
  approver: "Approver",
  allowance: "Spending limit",
  keys: "Agent connection",
  holds: "Held tips",
  budgetLabel: "01 / CONTRIBUTION RULES",
  budgetTitle: "A little support. Clear limits.",
  budgetBody:
    "Your saved defaults are ready. Adjust them to the amount you want each session to contribute.",
  identity: "Your account",
  bound: "Bound sign-in wallet",
  unbound:
    "Your wallet is not bound yet. Sign in with your wallet below to complete this checkpoint.",
  approverLabel: "02 / YOUR SIGNATURE",
  approverTitle: "You have the final say.",
  approverBody:
    "Held contributions wait for the designated wallet’s signature. Review the address that is actually active on chain.",
  allowanceLabel: "03 / SPENDING LIMIT",
  allowanceTitle: "Give spending a boundary.",
  allowanceBody:
    "Contribution rules are server-side caps. Your spending limit is a separate hard cap enforced by the contract, funded from your wallet.",
  allowanceSoon:
    "Budget wallet setup is coming soon. No spending limit can be set from this section yet.",
  allowancePending:
    "The spending-limit control is not available in this build yet. Refresh the checklist to see the server’s latest status.",
  continueKeys: "Continue to agent setup ↓",
  keysLabel: "04 / LOCAL CONNECTION",
  keysTitle: "Three commands. Then build.",
  keysBody:
    "Install the End Credits CLI once, create a key for this machine, then run these commands in order.",
  installLabel: "Once, on your machine",
  installCommand:
    "git clone https://github.com/zexoverz/end-credits && cd end-credits && pnpm install && pnpm --filter endcredits build && cd cli && npm link",
  installHint:
    "Needs Node 20+ and pnpm. Puts endcredits on your PATH so the Claude Code hooks can call it.",
  keyCommand: "endcredits key <token>",
  initCommand: "endcredits init",
  commandOne: "Then, with your new key",
  commandTwo: "Inside your project",
  keyPlaceholder:
    "Replace <token> with the key you just created. Never share it.",
  initHint:
    "Installs the Claude Code hooks for this project. Then run your next session as usual.",
  install: "CLI installation instructions ↗",
  installHref: "https://github.com/zexoverz/end-credits/blob/main/docs/details.md#cli",
  keyInit: "Then, inside your project:",
  holdsLabel: "05 / NEEDS YOUR DECISION",
  holdsTitle: "Review before you release.",
  holdsBody:
    "Open a held tip to inspect its evidence and sign or deny the release.",
  payer: "Agent wallet",
  balance: "USDC balance",
  balanceUnknown: "Balance unavailable",
  walletRoles:
    "This Agent wallet is unique to your account. It draws session funds from your wallet within your spending limit and returns any leftover when the session ends.",
  unit: "USDC",
  recordSession: "First session",
  network: "Base Sepolia · testnet",
  signOutFailed: "Sign-out could not be confirmed. Try again.",
  errors: {
    invalid_body:
      "The sign-in request was incomplete. Start again to create a fresh message.",
    bad_nonce:
      "This sign-in request expired or was already used. Try again for a fresh request in this browser.",
    bad_domain:
      "This message is for a different site or network. Open the official End Credits app and sign in again.",
    bad_signature:
      "The signature does not match the chosen wallet. Select the sign-in wallet and try again.",
    expired:
      "The message expired before sign-in finished. Try again and sign the new message within 10 minutes.",
    wrong_wallet:
      "The sign-in wallet does not match this account. Start sign-in again with the wallet you want to use.",
    no_owner:
      "Your account could not be created or loaded. Please try signing in again.",
    chain_error:
      "The server could not read the approver on chain. Nothing was bound. Please retry.",
    rejected: "You declined the wallet request. You can try again when ready.",
    pending:
      "A wallet request is already open. Open your wallet to finish or dismiss it first.",
    no_account:
      "The wallet did not return an account. Unlock it, choose an account and try again.",
    no_signature:
      "The wallet did not return a valid signature. Please try again.",
    network:
      "The sign-in server could not be reached. Check your connection and try again.",
    unknown: "Sign-in could not be completed. Please try again.",
  },
} as const;
