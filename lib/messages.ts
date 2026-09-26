// Every user-facing string (DESIGN §11). UI, tests and README quote this text.
export const MESSAGES = {
  PAID: "Paid {amount} USDC.",
  CAPPED: "Capped at {amount} USDC, the per-package limit for this session.",
  HELD_CHANGED:
    "Held: the funding address for {package} changed {days} days ago. Waiting for the owner.",
  HELD_MEDIUM: "Held: Intercepta rates this address medium risk ({score}). Waiting for the owner.",
  HELD_NO_CODE: "Held: {address} is a contract on Ethereum with no code on Base.",
  SCREEN_UNAVAILABLE: "Held: screening unavailable ({error}). Nothing is paid without a screen.",
  REFUSED_TRAIT: "Refused. Intercepta: {description}",
  IMPERSONATION:
    "Refused. Intercepta: this address impersonates {original} (address poisoning).",
  TOKEN_PIN: "Refused: the payment token is not Base Sepolia USDC.",
  LOOKALIKE: "Refused: {address} looks like {known} ({knownPackage}) but is a different address.",
  SPAM: "Refused: this address is the payee of {count} packages in this session, each new or under 1,000 weekly downloads.",
  PAYTO_MISMATCH: "Refused: the payment request names a different address than the one screened.",
  CHALLENGE_MISMATCH: "Refused: the payment request does not match this credit.",
  NOT_PAYABLE: "Not paid: this credit has no fresh paid decision to pay against.",
  RESERVED: "Reserved {amount} USDC for {package}. No wallet yet; the maintainer can claim it.",
  DUST: "Under 0.01 USDC. Not sent.",
  DAILY_LIMIT: "Daily limit reached. Nothing was sent.",
  RESOLVE_FAILED: "Not sent: the payee lookup failed ({error}). Nothing was paid.",
  EXECUTION_FAILED: "Decided, but the transfer did not go through ({error}). Nothing was sent.",
  PAYEE_INVALID: "The funding file names an invalid address.",
  SPOOF_REPO: "Reserved: {repo} does not publish {package}.",
  SCREENED_AS: "Screened as its mainnet equivalent (Base, chain 8453).",
  APPROVED: "Approved with World ID. Released {amount} USDC to {address}.",
  APPROVED_SESSION: "Approved by the owner. Released {amount} USDC to {address}.",
  DENIED: "Denied. {amount} USDC returned to the owner.",
  EXPIRED: "Not approved in time. {amount} USDC returned to the owner.",
  CANCELLED: "Verification cancelled. Nothing was released.",
  STALE_AUTH: "A fresh verification is required. Nothing was released.",
  WRONG_HUMAN: "This approval belongs to a different human.",
  NONCE: "This verification was not issued for this approval.",
  ACR: "A proof-of-human credential is required.",
  UNKNOWN_STATE: "This verification is not for a pending approval. Nothing was released.",
  VERIFY_FAILED: "The verification could not be checked. Nothing was released.",
  APPROVE_SENTENCE: "Release {amount} USDC to {address} for {package}.",
  CLAIM_HEADLINE: "Agents set aside {amount} USDC for {package} from {sessions} sessions.",
  NO_PERMISSION: "You need push or admin access to {repo} to claim for {package}.",
  PR_OPENED:
    "Pull request #{number} opened. Merge it to claim; merging is the proof that you control this repository.",
  PR_WAITING: "Waiting for #{number} to be merged.",
  PR_LINK:
    "Your GitHub sign-in cannot write to {repo}. Open the prefilled FUNDING.json on GitHub, commit it to {branch}, then check again.",
  FUNDING_MISMATCH: "FUNDING.json on {branch} names {found}, not your wallet {expected}.",
  CLAIM_REFUSED: "This address cannot receive funds. Intercepta: {description}",
  CLAIMED: "Claimed {amount} USDC to {address}.",
  ALREADY_PAYABLE: "{package} already lists a wallet. Agents pay it directly.",
  COOLING: "The funding address changed. Claims reopen at {time}.",
  NOT_A_PAYWALL:
    "End Credits is opt-in for whoever runs the agent. Packages stay free for everyone.",
  ROLL_TITLE: "This session was made possible by",
} as const;

export type MessageCode = keyof typeof MESSAGES;

// The `endcredits` CLI's own output (E1). Kept apart from the §11 codes above.
export const CLI_MESSAGES = {
  USAGE:
    "Usage: endcredits init [--global] | key <token> [--api <url>] | login [--api <url>] | settle [--session <id>] | attribute --session <id> [--dry-run] | mcp",
  LOGIN_CODE: "Open {url} in World App and confirm the code {code}.",
  LOGIN_SAVED: "Signed in with World ID. Agent key saved to {path}.",
  LOGIN_DENIED: "Sign-in was cancelled in World App. No key was saved.",
  LOGIN_EXPIRED: "The sign-in code expired. Run endcredits login again.",
  LOGIN_NO_OWNER: "This World ID is not an End Credits owner. No key was saved.",
  LOGIN_FAILED: "Sign-in failed ({error}). No key was saved.",
  INIT_ADDED: "End Credits hooks added to {path}.",
  INIT_UNCHANGED: "End Credits hooks are already in {path}.",
  INIT_INVALID: "Could not read {path} as JSON. Left it unchanged.",
  KEY_SAVED: "Agent key saved to {path}.",
  KEY_INVALID: "Could not save the agent key: {error}",
  KEY_MISSING: "No agent key yet. Run: endcredits key <token>",
  SESSION_REQUIRED: "Pass --session <id>.",
  NO_LEDGER: "No ledger for session {id}.",
  ROLLING: "End Credits: rolling credits at {url}",
  UPLOAD_FAILED:
    "End Credits: upload failed ({error}). The ledger is kept; retry with: endcredits settle --session {id}",
  NOTHING_USED: "No installed packages were used in session {id}.",
  TABLE_HEADER: "package|version|role|score|signals",
} as const;

export type CliMessageCode = keyof typeof CLI_MESSAGES;

type Vars = Record<string, string | number>;

function format(template: string, code: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`Missing message var: ${name} in ${code}`);
    return String(vars[name]);
  });
}

export function msg(code: MessageCode, vars: Vars = {}): string {
  return format(MESSAGES[code], code, vars);
}

export function cliMsg(code: CliMessageCode, vars: Vars = {}): string {
  return format(CLI_MESSAGES[code], code, vars);
}
