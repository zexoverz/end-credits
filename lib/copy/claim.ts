// Page copy for /npm/[name] (the maintainer claim). Server outcomes come from lib/messages.ts.
export const CLAIM_COPY = {
  REPO: "Repository",
  EYEBROW: "MAINTAINER CLAIM",
  FLOW_TITLE: "Your work. Your credits.",
  FLOW_INTRO:
    "Connect your repository to a wallet. We handle the checks and the on-chain claim.",
  RESERVE_LABEL: "Reserved for this package",
  NETWORK: "USDC · Base Sepolia testnet",
  GAS_NOTE: "End Credits submits the transactions. You pay no gas to claim.",
  JOURNEY: "Claim progress",
  PROOF_TITLE: "The proof lives in your repo.",
  PROOF_BODY:
    "FUNDING.json on the default branch connects your repository to your receiving wallet.",
  RETURN_NOTE: "GitHub brings you back here after sign-in.",
  ADDRESS_HINT:
    "Use an address you control. The reserve will be sent to this wallet on Base Sepolia.",
  ADDRESS_PLACEHOLDER: "0x…",
  FUNDING_FILE: "FUNDING.json",
  FILE_PREVIEW: "Proposed funding file",
  FALLBACK_TITLE: "Finish the pull request on GitHub",
  FALLBACK_BODY:
    "GitHub could not create the PR automatically. Open the prefilled file, propose the change, and merge it into the default branch.",
  MERGE_ACTION: "Review and merge on GitHub ↗",
  MERGE_EXTERNAL:
    "This part happens on GitHub. Come back after merging; this page checks automatically every 5 seconds.",
  AUTO_CHECK: "Automatic checks every 5 s",
  LAST_CHECK: "Last response",
  VERIFY_TITLE: "Repository merged. Verification is underway.",
  VERIFY_BODY:
    "The server reads FUNDING.json, checks the wallet with Intercepta, then submits setClaim and claim for the repository’s reserved packages. The next response confirms how far it got.",
  WAIT_TITLE: "Waiting for your merge",
  REFUSED_TITLE: "This claim could not proceed",
  COOLING_TITLE: "Waiting for the address change delay",
  SCREEN_TITLE: "Waiting for a wallet screening result",
  MISMATCH_TITLE: "The funding file needs attention",
  RECEIPT_TITLE: "Credits received.",
  RECEIPT_AMOUNT: "Claimed across this repository",
  RECEIPT_BODY:
    "The server has confirmed this claim. Open the transactions to inspect the on-chain record.",
  TX_TITLE: "Transaction receipts",
  TX_SET: "Register receiving wallet · setClaim",
  TX_CLAIM: "Claim reserve · transaction {number}",
  TX_MISSING: "No transaction hashes were returned for this claim.",
  TX_LINK: "View on Basescan ↗",
  RETRY: "Try again",
  REAUTH: "Sign in again with GitHub",
  SAVING_WALLET: "Saving your receiving wallet…",
  USDC: "USDC",

  NO_REPO:
    "npm lists no GitHub repository for this package, so it cannot be claimed here.",
  NOTHING_RESERVED: "Nothing is reserved for {package} yet.",
  CHAIN_ERROR:
    "Could not read the escrow on Base Sepolia. The reserved amount is unknown right now.",
  PAYEE_ERROR: "Could not check whether this package already lists a wallet.",
  ALSO_ACCEPTS: "Also accepts",
  PAYEE: "Payee",
  CLAIMED_BY_OTHER:
    "{package} has been claimed. Agents pay its wallet directly.",
  LOADING: "Loading…",
  NOT_FOUND: "No npm package with this name.",
  LOAD_FAILED: "Could not load this package ({error}).",

  STEP_GITHUB: "Sign in with GitHub",
  STEP_WALLET: "Choose your receiving wallet",
  STEP_PR: "Open the pull request",
  STEP_MERGE: "Merge, verify, receive",
  DONE: "done",
  ACTIVE: "now",
  LOCKED: "locked",
  FAILED: "failed",

  GITHUB_BUTTON: "Sign in with GitHub",
  GITHUB_AS: "Signed in as {login}.",
  GITHUB_CANCELLED: "GitHub sign-in was cancelled. Try again when ready.",
  GITHUB_WHY: "We check that you can push to {repo}.",

  WALLET_WHY:
    "A Coinbase smart wallet on Base, secured by a passkey. No seed phrase, no gas.",
  WALLET_BUTTON: "Create passkey wallet",
  WALLET_CONNECTING: "Waiting for the passkey…",
  WALLET_REJECTED: "The wallet request was cancelled.",
  WALLET_FAILED: "The wallet did not return an address ({error}).",
  WALLET_OR: "Or use an existing address",
  WALLET_USE: "Use this address",
  WALLET_INVALID: "That is not an Ethereum address.",
  WALLET_SET: "Wallet",

  PR_WHY:
    "Adds FUNDING.json with your wallet address to {repo}. Nothing else changes.",
  PR_BUTTON: "Open pull request",
  PR_OPENING: "Opening…",
  PR_VIEW: "View pull request #{number}",
  PR_OPEN_GITHUB: "Open GitHub",

  MERGE_WHY:
    "Merging is the proof you control the repository. We check every 5 seconds.",
  CHECK_NOW: "Check now",
  CHECKING: "Checking…",
  CLAIMED_TO: "Sent to",

  ERR_SIGNED_OUT: "Your GitHub session ended. Sign in again.",
  ERR_INVALID_ADDRESS: "That is not an Ethereum address.",
  ERR_NO_WALLET: "Add a wallet first.",
  ERR_GITHUB: "GitHub did not answer as expected. Try again.",
  ERR_BAD_ORIGIN: "This request came from another site and was refused.",
  ERR_UNKNOWN_PACKAGE: "No npm package with this name.",
  ERR_NO_REPO: "npm lists no GitHub repository for this package.",
  ERR_GENERIC: "Something went wrong ({error}).",
} as const;

export type ClaimCopyCode = keyof typeof CLAIM_COPY;

export function claimCopy(
  code: ClaimCopyCode,
  vars: Record<string, string | number> = {},
): string {
  return CLAIM_COPY[code].replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`Missing copy var: ${k} in ${code}`);
    return String(vars[k]);
  });
}
