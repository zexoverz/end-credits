# API notes for the frontend

## Intercepta: payment simulation and payer screen (26 Sep)

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
