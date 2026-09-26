export const SETUP_STEPS = [
  {
    id: "signed_in",
    title: "Sign in",
    body: "Sign a message with MetaMask or your Base Account passkey. This signs you in without sending a transaction.",
    action: "Sign in with your wallet",
    href: "/app/owner#identity",
  },
  {
    id: "wallet_bound",
    title: "Bind your wallet",
    body: "Your first eligible wallet sign-in binds your owner account. If an approver is already set, use that wallet. After binding, use the same wallet to sign in.",
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
    title: "Set your approver",
    body: "Choose the wallet that signs releases of held contributions. An address change may have an on-chain activation delay.",
    action: "Set approver",
    href: "/app/owner#approver",
  },
  {
    id: "spend_allowance",
    title: "Set a spend allowance",
    body: "Choose your budget wallet, approve USDC to the budget contract, then set the agent’s allowance per period. This is separate from saving your contribution settings.",
    action: "Open budget wallet",
    href: "/app/owner#allowance",
  },
  {
    id: "agent_key",
    title: "Connect your agent",
    body: "Create an agent key. Run endcredits key <token> on your machine, then endcredits init inside your project.",
    action: "Create an agent key",
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
  eyebrow: "OWNER / SETUP & CONTROLS",
  title: "Set the rules.\nLet your agent build.",
  subtitle: "One guided setup. Your wallet, your limits, your permission.",
  passport: "YOUR OWNER PASS",
  passportBody:
    "A wallet opens your workspace. A few deliberate choices make it yours.",
  signInTitle: "Sign in with your wallet",
  signInBody:
    "Use the owner wallet, or the existing escrow approver on your first sign-in.",
  messageOnly: "Message signature only. No transfer or spend permission.",
  statement: "Sign in to End Credits",
  metamask: "Continue with MetaMask",
  passkey: "Continue with Base Account",
  metamaskHint: "Browser wallet",
  passkeyHint: "Passkey wallet",
  noExtension:
    "MetaMask is not available in this browser. Open this page in a wallet browser or use Base Account.",
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
  allowance: "Spend allowance",
  keys: "Agent connection",
  holds: "Held tips",
  budgetLabel: "01 / CONTRIBUTION RULES",
  budgetTitle: "A little support. Clear limits.",
  budgetBody:
    "Your saved defaults are ready. Adjust them to the amount you want each session to contribute.",
  identity: "Owner identity",
  bound: "Bound sign-in wallet",
  unbound:
    "Your wallet is not bound yet. Sign in with your wallet below to complete this checkpoint.",
  approverLabel: "02 / YOUR SIGNATURE",
  approverTitle: "You have the final say.",
  approverBody:
    "Held contributions wait for the designated wallet’s signature. Review the address that is actually active on chain.",
  allowanceLabel: "03 / BUDGET WALLET",
  allowanceTitle: "Give spending a boundary.",
  allowanceBody:
    "Contribution settings describe your budget. A spend allowance separately authorizes the budget wallet to use funds.",
  allowanceSoon:
    "Budget wallet setup is coming soon. No allowance can be granted from this section yet.",
  allowancePending:
    "The spend-allowance control is not available in this build yet. Refresh the checklist to see the server’s latest status.",
  continueKeys: "Continue to agent setup ↓",
  keysLabel: "04 / LOCAL CONNECTION",
  keysTitle: "Two commands. Then build.",
  keysBody:
    "With the End Credits CLI installed, create a key for this machine and run these commands in order.",
  keyCommand: "endcredits key <token>",
  initCommand: "endcredits init",
  commandOne: "On your machine",
  commandTwo: "Inside your project",
  keyPlaceholder:
    "Replace <token> with the key you just created. Never share it.",
  initHint:
    "Installs the Claude Code hooks for this project. Then run your next session as usual.",
  install: "CLI installation instructions ↗",
  installHref: "https://github.com/zexoverz/end-credits#cli",
  keyInit: "Then, inside your project:",
  holdsLabel: "05 / NEEDS YOUR DECISION",
  holdsTitle: "Review before you release.",
  holdsBody:
    "Open a held tip to inspect its evidence and sign or deny the release.",
  payer: "Current funding wallet",
  balance: "USDC balance",
  balanceUnknown: "Balance unavailable",
  walletRoles:
    "This is the server’s funding wallet. Your sign-in wallet, approver and spend allowance have separate roles.",
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
      "The signature does not match the chosen wallet. Select the owner wallet and try again.",
    expired:
      "The message expired before sign-in finished. Try again and sign the new message within 10 minutes.",
    wrong_wallet:
      "This is not the owner wallet. Switch to the bound wallet, or the existing escrow approver for a first sign-in.",
    no_owner:
      "This server has no owner account yet. The operator needs to initialize it before you can sign in.",
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
