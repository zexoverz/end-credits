# API notes for the frontend

## Intercepta: payment simulation and payer screen (26 Sep)

Note: the payment simulation is off in production (`SIMULATE_PAYMENTS` unset), so `SIMULATED`,
`REFUSED_SIMULATION` and `HELD_SIMULATION` will not appear on live sessions. Render them if present,
but do not design the page around them. The payer screen (`PAYER_*`, the extra address screen with
`mappedFrom` "eip155:84532 x402 payer") is on.

Backend branch `intercepta-sim-and-payer`. No new routes and no changed response shapes; new
values appear in existing fields. Text always comes from `lib/messages.ts`, so render `text` as is.

### New reason codes

They appear in `reasons` (`{source, code, text}`) on the session view (`GET /api/sessions/[id]`,
each credit's `reasons`) and on history (`GET /api/history`, each item's `reasons`).

| code | source | outcome | example `text` |
| --- | --- | --- | --- |
| `SIMULATED` | `intercepta` | `paid` / `capped` | Simulated on Base: −0.25 USDC from the payer to 0xF233…Eeb87. x402 settles it by transferWithAuthorization, which moves the same USDC. |
| `REFUSED_SIMULATION` | `intercepta` | `refused` | Refused. Intercepta flagged the simulated payment: {detector description} |
| `HELD_SIMULATION` | `intercepta` | `held` | Held: the simulated payment moves -0.5 USDC instead of 0.25 USDC to 0x…. |

A failed simulation holds with the existing `SCREEN_UNAVAILABLE` code. On a refusal or hold from the
simulation, the `PAID`/`CAPPED` reason is removed; `SCREENED_AS` stays.

Suggested display: `SIMULATED` as a green "payment simulated" check next to the payee screen;
`REFUSED_SIMULATION` like `REFUSED_TRAIT`; `HELD_SIMULATION` like the other held reasons.

### History screens

History items' `screens` (`{id, kind, status, latencyMs, mappedFrom, screenedAs, fetchedAt}`) now
include:

- **The simulation:** `kind: "simulation"`, `status: 200`. `mappedFrom` reads
  `eip155:84532/0x036c…cf7e; payer 0xaf4c…9bb6 simulated as 0x3304…566a` (the payer has no mainnet
  USDC, so a funded Base holder sends the same amount to the same payee). Label it "Payment
  simulation".
- **The payer screen:** `kind: "address"`, added when the x402 route screens who pays. It is told
  apart from the payee's address screen by `mappedFrom: "eip155:84532 x402 payer"`. Label it
  "Payer wallet". `status: 404` there means the payer has no mainnet history, which is accepted.

The session view does not list screens; only history does.

### x402 route responses (`GET /api/x402/credit/[creditId]`)

Called by our own settler, not by the UI. New answers before any settlement:

- `403 {code: "PAYER_REFUSED", message: "Refused: Intercepta flags the paying wallet. …"}`
- `503 {code: "PAYER_SCREEN_UNAVAILABLE", message: "Not settled: the paying wallet could not be screened (TIMEOUT). Nothing was settled."}`
- `400 {code: "INVALID_PAYMENT"}` when the signed authorization has no valid `from`.

In the session view, a credit whose x402 call got 403/503 shows `EXECUTION_FAILED` for now.
Each backend change appends its own section. Amounts are `Money = {micro: string, usdc: string}`
(micro-USDC as a decimal string, and the same amount formatted as USDC). Times are ISO 8601 UTC.

## Risk profile and dashboard actions

### `GET /api/risk/<address>` (public)

Counterparty risk profile from our DB only: no Intercepta call is made. `<address>` is checksummed or
lowercase; anything else is `400 {"error":"invalid_address"}`. An address we never saw is a `200`
with an empty profile (zero counts, `null` verdicts, empty lists).

```jsonc
{
  "address": "0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551", // checksummed
  "source": "db",
  "screens": { "count": 3, "firstAt": "2026-09-26T01:00:01.000Z", "lastAt": "2026-09-26T01:00:03.000Z" },
  "intercepta": {
    // newest successful quick scan; null if none. noHistory: Intercepta has never seen the address
    "address": {
      "toxicScore": 100,
      "traits": [{ "name": "sanction_address", "description": "Address is on the OFAC SDN list", "risk": 100 }],
      "noHistory": false,
      "screenedAt": "2026-09-26T01:00:02.000Z"
    },
    "impersonation": { "isAddressPoisoned": false, "originalAddress": null, "screenedAt": "..." }, // or null
    "simulation": { "detectors": [{ "code": "SCAM_ADDRESS", "description": "..." }], "screenedAt": "..." } // or null
  },
  // packages whose funding file named this address
  "payeeOf": [
    {
      "package": "@endcredits-demo/moved-payout",
      "packageKey": "0x…",
      "source": "drips",            // claim | drips | tea | npm_funding
      "sourceUrl": "https://…",
      "firstObservedAt": "…", "lastObservedAt": "…", // for this address
      "current": false,             // is this address the package's latest payee?
      "changed": true,              // the package has named more than one address
      "addresses": [                // every address the package named, oldest first
        { "address": "0xA…", "source": "drips", "firstObservedAt": "…", "lastObservedAt": "…", "current": false },
        { "address": "0xB…", "source": "drips", "firstObservedAt": "…", "lastObservedAt": "…", "current": true }
      ]
    }
  ],
  // our decisions for credits with this payee, across sessions
  "decisions": {
    "count": 2,
    "sessions": 2,
    "byOutcome": {
      "paid": { "count": 0, "amount": { "micro": "0", "usdc": "0" } },
      "capped": { … }, "held": { … }, "refused": { "count": 2, "amount": { "micro": "500000", "usdc": "0.5" } },
      "reserved": { … }, "dust": { … }
    },
    "last": {
      "package": "@endcredits-demo/left-padder-pro",
      "outcome": "refused",
      "amount": { "micro": "250000", "usdc": "0.25" },
      "decidedAt": "2026-09-26T02:01:00.000Z",
      "reasons": [{ "source": "intercepta", "code": "REFUSED_TRAIT", "text": "Refused. Intercepta: …" }]
    } // or null
  }
}
```

Where to show it: a **risk section on `/app/npm/<name>`**, from `payeeRisk` below. Show the traits
with their descriptions, the impersonation result, "changed" with both addresses, and the outcome
counts. Link any address to `/api/risk/<address>` if a standalone view is wanted later.

### `GET /api/npm/<name>`: new `payeeRisk`

`payeeRisk` is the same object as above for the package's current `payee.address`, or `null` when
there is no payee. If the profile read fails, `payeeRisk` is `null` and `errors` contains `"risk"`.

### `GET /api/dashboard`: new `actions` and `timeline`

Every existing field is unchanged. Both new fields come from the same MultiBaas reads as the rest
(no extra calls unless there were more than 50 escrow events in the last 48 h) and share the 60 s
cache. A MultiBaas failure is still a 503 with no numbers at all.

```jsonc
"actions": [
  // 1. warnings first: a hold that expires within 2 h (also listed again as approve_hold)
  { "kind": "hold_expiring", "title": "0.1 USDC for @endcredits-demo/moved-payout expires at 2026-09-26T13:00:00.000Z. Not approved by then, it returns to you.",
    "detail": "Held: the funding address for … changed today. Waiting for the owner.",
    "href": "/app/approve/0x<tipId>", "amount": { "micro": "100000", "usdc": "0.1" }, "source": "multibaas",
    "tipId": "0x…", "package": "@endcredits-demo/moved-payout", "payee": "0x…", "expiresAt": "2026-09-26T13:00:00.000Z" },
  // 2. held tips waiting for the owner's signature, soonest expiry first
  { "kind": "approve_hold", "title": "Approve or deny 0.1 USDC held for @endcredits-demo/moved-payout.", "detail": "<reason texts>",
    "href": "/app/approve/0x<tipId>", "amount": {…}, "source": "multibaas", "tipId": "0x…", "package": "…", "payee": "0x…", "expiresAt": "…" },
  // 3. reserves waiting for a maintainer, largest first
  { "kind": "reserve_waiting", "title": "0.25 USDC reserved for @endcredits-demo/unclaimed-utils from 1 sessions, waiting for the maintainer to claim.",
    "detail": null, "href": "/app/npm/@endcredits-demo/unclaimed-utils", "amount": {…}, "source": "multibaas",
    "package": "@endcredits-demo/unclaimed-utils", "packageKey": "0x…", "sessions": 1 }
]
```

- `title` is ready to show (from `lib/messages.ts`); `detail` may be `null`.
- A hold our DB has not written yet shows with `package: null`, `payee: null`, and the tip id in the
  title. A reserve for a package our DB does not know has `package: null` and `href: "/app/packages"`.
- A hold already past `expiresAt` is not an action (it can no longer be released; the expirer refunds it).
- `source` is `"multibaas"` for all three kinds today: the pending state and amounts are MultiBaas;
  the DB only adds names, payees and reason texts. `"db"` is reserved for DB-only actions.

```jsonc
"timeline": [ // exactly 48 entries, one per UTC hour, oldest first; the last one is the current hour
  { "hour": "2026-09-26T10:00:00.000Z",
    "paid": { "micro": "0", "usdc": "0" },          // payer → payee USDC transfers, not to the escrow
    "held": { "micro": "750000", "usdc": "0.75" },
    "released": { "micro": "250000", "usdc": "0.25" },
    "refunded": { "micro": "500000", "usdc": "0.5" }, // denied + expired
    "reserved": { "micro": "750000", "usdc": "0.75" },
    "claimed": { "micro": "0", "usdc": "0" } }
]
```

Where to show them: **`/dashboard`**, actions as a list above the cards (each row links to `href`),
and the timeline as a 48 h chart under the cards. Hours with no events are present with zeros.

## Claim view: transaction hashes (26 Sep)

Every claim endpoint (`/api/claim/<name>/{wallet,pr,status}` and `claim` in `/api/npm/<name>`) now
also returns `setClaimTx: string | null` (the escrow `setClaim` tx) and `claimTxs: string[]` (one
`claim` tx per package of the repo). Link them as `https://sepolia.basescan.org/tx/<hash>` on the
claimed state. A full claim was run live on 26 Sep on `@endcredits-demo/unclaimed-rehearsal-1`:
GitHub sign-in, wallet, PR, merge, then `setClaim` `0x982155da…fea1` and `claim` `0xf0bce1f1…921d`
(0.25 USDC to the maintainer wallet).

## Wallet sign-in and onboarding

The owner signs in with the same wallet that is the escrow approver (MetaMask or the Base Account
passkey wallet). World sign-in is off: `GET /api/auth/methods` returns `world: false`, so remove the
World button from the UI. The dev-token login stays for scripts and as a demo fallback, shown only
when `dev` is true.

`GET /api/auth/methods` → `{ wallet: true, dev: boolean, world: boolean }`

`POST /api/auth/wallet/nonce` (no body) → `{ nonce: string }`. Sets the `ec_owner` cookie holding the
nonce for 10 minutes; send the sign-in from the same browser (`credentials: "same-origin"`).

`POST /api/auth/wallet` `{ message: string, signature: "0x…" }` → `200 { ownerId, wallet }` and the
owner cookie. Errors are `{ error }`:

| status | `error` | meaning |
|---|---|---|
| 400 | `invalid_body` | missing message or a signature that is not hex |
| 401 | `bad_nonce` | no nonce, a nonce not from this cookie, older than 10 min, or already used: get a new one |
| 401 | `bad_domain` | `domain`, `uri` origin or `chainId` (must be 84532) not this app |
| 401 | `bad_signature` | the signature does not match the address in the message |
| 401 | `expired` | `issuedAt` older than 10 min (or in the future), or `expirationTime` passed |
| 403 | `wrong_wallet` | not the owner's wallet (see below) |
| 404 | `no_owner` | no owner row yet |
| 502 | `chain_error` | the approver read failed on a first sign-in; retry |

Which wallet: the first wallet to sign in is bound to the owner, but only if the owner has no wallet
yet and the address is the owner's on-chain approver, or no approver is set. After that only that
wallet signs in; any other gets `wrong_wallet`.

Client flow:

```ts
import { createSiweMessage } from "viem/siwe";

const { nonce } = await (await fetch("/api/auth/wallet/nonce", { method: "POST" })).json();
const message = createSiweMessage({
  domain: window.location.host,
  address, // from eth_requestAccounts
  statement: "Sign in to End Credits",
  uri: window.location.origin,
  version: "1",
  chainId: 84532,
  nonce,
});
const signature = await provider.request({ method: "personal_sign", params: [message, address] });
const res = await fetch("/api/auth/wallet", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message, signature }),
});
```

`provider` is MetaMask (`window.ethereum`) or the Base Account provider already set up in
`components/approver/connect-wallet.tsx`. A passkey wallet that is not deployed yet signs with an
ERC-6492 envelope; the server verifies EOA, ERC-1271 and ERC-6492 signatures. `createSiweMessage`
sets `issuedAt` to now; sign within 10 minutes. The app origin must be `APP_URL`, so sign in on the
fixed hostname, not a preview URL.

### Onboarding checklist

`GET /api/owner/onboarding` (owner cookie) → `{ steps: Step[], next: string | null }` where
`Step = { id, done: boolean, detail: string | null, href: string | null }`, always in this order:

| `id` | done when | `detail` | `href` |
|---|---|---|---|
| `signed_in` | always | null | null |
| `wallet_bound` | a wallet is bound | the wallet address | null |
| `budget_set` | always (defaults exist) | `"2 USDC per session, 0.25 per package, 20 per day"` from the saved values | `/app/owner#budget` |
| `approver_set` | on-chain `approverOf(payer)` is set | the approver address; `"chain unavailable"` on a failed read | `/app/owner#approver` |
| `spend_allowance` | the budget wallet (`budget_owner`, else the sign-in wallet) gives our agent key an allowance with something left this period, and its USDC approval to the budget contract covers a full period | `"coming soon"` without `BUDGET_ADDRESS`; else `"20 USDC per day, 12.5 left"` (plus `", only 5 USDC approved"` when short), null when none | `/app/owner#allowance` |
| `agent_key` | a non-revoked agent key exists | null | `/app/owner#keys` |
| `first_session` | a session was uploaded | null | `/app/credits/<latest session id>`, null before |

`next` is the id of the first step not done (null when all are). The page needs the anchors `#budget`,
`#approver`, `#allowance` and `#keys`.

## Budget wallet (spend limits)

The owner's USDC stays in the owner's own wallet. From that wallet the owner approves USDC to
`EndCreditsBudget` and gives our agent key (`spender`) an allowance per period. Each settlement pulls
exactly what the session will pay, hold or reserve, once, before anything moves. All three wallet
transactions are sent by the browser from the owner's wallet; the server never signs them.

`GET /api/owner/budget` (owner) →

```json
{
  "budgetAddress": "0x1429…0b36",
  "usdc": "0x036C…CF7e",
  "budgetOwner": "0xAbC…",
  "spender": "0x9ebd…",
  "usdcBalance": "12.5",
  "usdcAllowanceToBudget": "20",
  "allowance": {
    "perPeriod": "20",
    "period": 86400,
    "periodStart": "2026-09-26T00:00:00.000Z",
    "spentInPeriod": "1.5",
    "remaining": "18.5"
  },
  "error": null
}
```

- USDC amounts are decimal strings; `period` is seconds; `periodStart` is ISO.
- `budgetAddress: null` means spend limits are off on this server (`BUDGET_ADDRESS` unset): hide the
  card or show "not switched on". Settlement then pays from the agent key's own balance, as before.
- `budgetOwner: null` means no wallet named yet: the chain fields are null and nothing was read.
- `allowance: null` means no allowance for our `spender`; nothing can be pulled.
- `error: "rpc_unavailable"` when a chain read failed or took over 5 s; the chain fields are null.

`POST /api/owner/budget` `{ address }` stores the budget wallet (checksummed) and answers as GET.
`400 { error: "invalid_body" }` on a bad address.

`GET /api/owner` now carries the same object as `budget`.

The browser then sends, from the budget wallet on Base Sepolia (84532):

| step | to | call |
|---|---|---|
| approve | `usdc` | `approve(budgetAddress, amount)` |
| allowance | `budgetAddress` | `setAllowance(spender, perPeriod, period)`, period 3600 to 2592000 s |
| revoke | `budgetAddress` | `revoke(spender)` |

`components/budget/budget-wallet.tsx` does all of this (MetaMask via `window.ethereum` first, Base
Account otherwise), defaults the cap to the owner's daily limit per day, and sits next to the approver
card on `/owner` with `id="allowance"`. Copy is in `lib/copy/budget.ts`. Restyle freely.

Two new credit reasons can appear:

| code | text |
|---|---|
| `BUDGET_PULL_FAILED` | "Not sent: the owner's budget wallet refused the pull ({error})." on every credit that would have moved; `{error}` is the revert name, e.g. `OverPeriodCap`, `NoAllowance`, `ERC20InsufficientAllowance` or USDC's revert string. The decisions stay; nothing moved. |
| `BUDGET_CAP` | "The owner's on-chain budget has nothing left this period. Nothing was sent." on every credit (dust) when the allowance has nothing left |

The session row has a new `budget_pull_tx` (the pull's tx hash, null when there was no pull).

## Package page: refused payee and public claim (26 Sep)

`GET /api/npm/<name>` adds two fields:
- `payeeRefused: string | null`: set when Intercepta's latest verdict on the package's payee is a
  refusal (a critical trait such as a sanction, or a score above 50). Then `alreadyPayable` is null.
  Show it as the package's state ("Agents refuse to pay …: Intercepta flags the address it lists. …"),
  never as payable. Live example: `@endcredits-demo/left-padder-pro`.
- `claimed: {wallet, setClaimTx, claimTxs} | null`: the newest finished claim for the repo, public
  (no sign-in needed). Link the txs to Basescan. Live example: `@endcredits-demo/unclaimed-rehearsal-1`.

## Agent to agent: paid through the maintainer's own x402 endpoint (26 Sep)

A package can list its own x402 service in `FUNDING.json` (`"x402": {"endpoint": "https://…"}`).
The settler then pays that service instead of our route. No new routes.

**`paidVia`** is new on each credit of `GET /api/sessions/[id]` and each item of `GET /api/history`:

| value | meaning |
|---|---|
| `"maintainer_x402"` | paid through the maintainer's own endpoint (another agent's server) |
| `"endcredits_x402"` | paid through our own x402 route |
| `null` | not paid (held, refused, reserved, dust, or not executed) |

On the roll, a `maintainer_x402` credit can say "paid through the maintainer's own x402 endpoint";
the reason below carries the host.

New reason codes (`reasons`, source `policy`):

| code | outcome | example `text` |
| --- | --- | --- |
| `PAID_VIA_MAINTAINER` | `paid` / `capped` | Paid through endcredits-tipjar.up.railway.app, the maintainer's own x402 endpoint. |
| `ENDPOINT_REFUSED` | `refused` | Refused: the maintainer's x402 endpoint 169.254.169.254 resolves to a private or reserved address. |

`{reason}` in `ENDPOINT_REFUSED` is one of: "is not https", "resolves to a private or reserved
address", "does not resolve", "answered with a redirect", "did not answer within 8 s", "answered with
more than 64 KB", "could not be reached".

When a maintainer endpoint's 402 names a different address than the screened payee (the clipper),
the credit is now `refused` with `PAYTO_MISMATCH` ("Refused: the payment request names a different
address than the one screened.") and its `PAID` line is removed. Same for `TOKEN_PIN` and
`CHALLENGE_MISMATCH` from a maintainer endpoint. Nothing was signed. Show it like the other refusals.
Fixtures: `@endcredits-demo/tip-jar` (honest) and `@endcredits-demo/swapped-jar` (clipper).
