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
  TOKEN_PIN: "Refused: the payment token is not Base Sepolia USDC.",
  LOOKALIKE: "Refused: {address} looks like {known} ({knownPackage}) but is a different address.",
  SPAM: "Refused: this address is the payee of {count} packages in this session, each new or under 1,000 weekly downloads.",
  PAYTO_MISMATCH: "Refused: the payment request names a different address than the one screened.",
  CHALLENGE_MISMATCH: "Refused: the payment request does not match this credit.",
  NOT_PAYABLE: "Not paid: this credit has no fresh paid decision to pay against.",
  RESERVED: "Reserved {amount} USDC for {package}. No wallet yet; the maintainer can claim it.",
  DUST: "Under 0.01 USDC. Not sent.",
  DAILY_LIMIT: "Daily limit reached. Nothing was sent.",
  PAYEE_INVALID: "The funding file names an invalid address.",
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
  APPROVE_SENTENCE: "Release {amount} USDC to {address} for {package}.",
  CLAIM_HEADLINE: "Agents set aside {amount} USDC for {package} from {sessions} sessions.",
  NO_PERMISSION: "You need push or admin access to {repo} to claim for {package}.",
  PR_OPENED:
    "Pull request #{number} opened. Merge it to claim; merging is the proof that you control this repository.",
  PR_WAITING: "Waiting for #{number} to be merged.",
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

export function msg(code: MessageCode, vars: Record<string, string | number> = {}): string {
  return MESSAGES[code].replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`Missing message var: ${name} in ${code}`);
    return String(vars[name]);
  });
}
