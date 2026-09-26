# API notes for the frontend

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
