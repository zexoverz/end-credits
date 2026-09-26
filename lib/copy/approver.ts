// Copy for the approver wallet components (components/approver/*, escrow v2; AGENTS.md rule 14).
export const APPROVER_COPY = {
  // connect-wallet
  CONNECT: "Connect wallet",
  CONNECT_BROWSER: "Use browser wallet",
  CONNECTING: "Opening wallet…",
  CONNECTED: "Wallet",
  CONNECT_FAILED: "Could not connect the wallet ({error}).",
  // set-approver (/owner)
  TITLE: "Approver wallet",
  EXPLAIN:
    "Every release of a held tip needs a signature from this wallet. The server cannot release without it.",
  STORED: "Approver",
  ONCHAIN: "On chain now",
  PENDING: "Takes over at {time}",
  PENDING_NOTE: "A change waits 3 days on chain. Until then the current approver signs releases.",
  NONE: "none",
  SET: "Use this wallet as approver",
  SETTING: "Setting…",
  SET_DONE: "Approver set.",
  SET_FAILED: "Could not set the approver ({error}).",
  PAYER_MISMATCH: "This server's payer key is not this owner's payer, so it cannot name an approver.",
  LOAD_FAILED: "Could not read the approver ({error}).",
  // sign-release (/approve)
  NO_APPROVER: "Set an approver wallet on the owner page first, then approve.",
  NO_APPROVER_LINK: "Go to the owner page",
  SIGN: "Sign and approve",
  SIGN_WORLD: "Sign, then approve with World ID",
  PREPARING: "Preparing…",
  SIGNING: "Confirm in your wallet…",
  WRONG_WALLET: "Connect the approver wallet {approver}; this is {address}.",
  BAD_SIGNATURE: "That signature is not from the approver wallet. Nothing was released.",
  SIGN_FAILED: "Signing did not finish ({error}). Nothing was released.",
} as const;
