# Intercepta in End Credits

## Intercepta: the moment of decision

Every payee is screened live by Intercepta before a payment is signed or a hold is sent, and the
answer picks what happens to the money. We pay on Base Sepolia, but the payees are the real
addresses maintainers published, so their **mainnet** reputation is what gets screened.

The order, per credit, in [`lib/settle/settle.ts`](../lib/settle/settle.ts):

1. Screen the payee ([`#L302-L303`](../lib/settle/settle.ts#L302-L303)). A screen that throws becomes
   `error: "HTTP"` ([`#L403-L410`](../lib/settle/settle.ts#L403-L410)), which holds.
2. `decide` runs the matrix on the screen ([`#L304-L315`](../lib/settle/settle.ts#L304-L315)).
3. The decision and its reasons are stored, with the ids of the screens that produced it
   ([`#L322-L331`](../lib/settle/settle.ts#L322-L331)), for every credit of the session.
4. Only then is money pulled from the owner's budget and anything signed or sent
   ([`#L168-L172`](../lib/settle/settle.ts#L168-L172), [`#L355-L401`](../lib/settle/settle.ts#L355-L401)):
   x402 for `paid` / `capped`, `hold` or `reserve` on the escrow, nothing for `refused`.
5. At signing time the x402 client checks the 402 challenge against the screened payee and the
   stored decision ([`lib/x402/client.ts#L39-L68`](../lib/x402/client.ts#L39-L68)), and the resource
   refuses to quote a credit whose payee has no successful screen from the last 10 minutes
   ([`lib/x402/server.ts#L82-L90`](../lib/x402/server.ts#L82-L90)).

Timeout or error from Intercepta means hold, never pay. Every call is retried once, 500 ms later, on
a timeout, a network error, a 5xx or a 429, and both attempts are stored
([`lib/intercepta/http.ts#L51-L56`](../lib/intercepta/http.ts#L51-L56),
[`lib/intercepta/client.ts#L76-L81`](../lib/intercepta/client.ts#L76-L81)). In production one
impersonation check timed out at 8 s while the quick scan for the same address answered clean in
about 1 s, and a clean payee held as `SCREEN_UNAVAILABLE`. One slow request should not decide a
payee. A second failure still holds.

### The paid side: our x402 route screens who pays

Our resource `GET /api/x402/credit/{creditId}` is a paid service too, so it screens the payer. After
the signed payment matches the challenge and before the facilitator's `verify` and `settle`, it
quick-scans `payload.authorization.from`
([`lib/x402/server.ts#L126-L145`](../lib/x402/server.ts#L126-L145), called at
[`#L162-L163`](../lib/x402/server.ts#L162-L163)). A critical trait or `toxicScore > 50` answers 403
`PAYER_REFUSED` with Intercepta's description; a failed screen answers 503
`PAYER_SCREEN_UNAVAILABLE`. Neither reaches the facilitator. A payer with no mainnet history passes,
since fresh wallets are normal, and the screen id joins the credit's `screen_ids`.

### Counterparty risk profile

`GET /api/risk/<address>` ([`lib/risk/profile.ts`](../lib/risk/profile.ts),
[`app/api/risk/[address]/route.ts`](../app/api/risk/%5Baddress%5D/route.ts)) shows what we know about
an address: the latest quick-scan and impersonation verdicts, simulation detectors, every package
that ever named it, and how its credits ended. It reads only our stored screens, so a page view costs
no Intercepta quota. The package page gets the same profile for its current payee as `payeeRisk` in
`GET /api/npm/<name>` ([`lib/claim/summary.ts`](../lib/claim/summary.ts)).

### Where the API is called

| File | What |
|---|---|
| [`lib/intercepta/client.ts#L61-L112`](../lib/intercepta/client.ts#L61-L112) | the one HTTP path: `X-API-KEY`, 8 s deadline, one retry on a transient failure, every attempt stored in `screens` with status, body and latency |
| [`lib/intercepta/client.ts#L117-L126`](../lib/intercepta/client.ts#L117-L126) | `quickScan`: `GET /api/public/v2/extension/account/{address}/quick-scan` (payees, claim wallets, x402 payers) |
| [`lib/intercepta/client.ts#L128-L134`](../lib/intercepta/client.ts#L128-L134) | `checkImpersonation`: `GET /api/public/v1/extension/poisoning-attack/check-address/{address}` |
| [`lib/intercepta/client.ts#L136-L143`](../lib/intercepta/client.ts#L136-L143) | `tokenRisks`: `GET /api/public/v2/extension/token-intelligence/token/{address}/risks?chainId=8453` |
| [`lib/intercepta/client.ts#L145-L153`](../lib/intercepta/client.ts#L145-L153) | `simulateTransfer`: `POST /api/public/v1/extension/simulation/transaction?chainId=8453`, only when the quick scan fails |
| [`lib/intercepta/client.ts#L158-L168`](../lib/intercepta/client.ts#L158-L168) | `simulatePayment`: the same endpoint for the exact payment, off unless `SIMULATE_PAYMENTS=true` (see the feedback below) |
| [`lib/intercepta/client.ts#L172-L212`](../lib/intercepta/client.ts#L172-L212) | `screenPayee`: quick scan, impersonation and token risks in parallel; any failure left sets `Screen.error` |
| [`lib/decision/matrix.ts#L37-L113`](../lib/decision/matrix.ts#L37-L113) | how the screen decides: token block, screen error, traits, score, impersonation, medium, no history |
| [`lib/x402/server.ts#L126-L145`](../lib/x402/server.ts#L126-L145) | the payer screen on our paid x402 route |
| [`lib/claim/wallet-screen.ts`](../lib/claim/wallet-screen.ts), called from [`lib/claim/env.ts#L49`](../lib/claim/env.ts#L49) | a maintainer's claim wallet is quick-scanned before `setClaim` |
| [`lib/risk/profile.ts`](../lib/risk/profile.ts) | the counterparty risk profile, from stored screens only |
| [`lib/intercepta/cache.ts`](../lib/intercepta/cache.ts) | reuse: address screens 5 min, token screens 1 h, only rows that parsed |
| [`scripts/probe-intercepta.ts`](../scripts/probe-intercepta.ts) | the probe behind [`docs/intercepta-probe.md`](intercepta-probe.md) (10 real responses, verbatim) |

### Decision matrix, as built

[`lib/decision/matrix.ts`](../lib/decision/matrix.ts). First match wins. Thresholds are ours.

| # | Condition | Outcome | Message code |
|---|---|---|---|
| 1 | no payee | `reserved` (screened later, at claim) | `RESERVED` |
| 2 | payment token is not Base Sepolia USDC | `refused` | `TOKEN_PIN` |
| 2 | Intercepta token risks `action == block` | `refused` | detector text |
| 3 | screen timeout, HTTP error or unparsable body | `held` | `SCREEN_UNAVAILABLE` |
| 4 | a critical trait (`sanction_address`, `known_scammer`, `blacklist`, `fake_phishing_transfer`, or a simulation detector naming the recipient) | `refused` | `REFUSED_TRAIT`, Intercepta's description verbatim |
| 4 | `toxicScore > 50` | `refused` | `REFUSED_TRAIT` |
| 4 | Intercepta impersonation check says address poisoning | `refused` | `IMPERSONATION` |
| 4 | our lookalike rule: same first 4 and last 4 hex as another known payee, different address | `refused` | `LOOKALIKE` (labelled as ours) |
| 4 | our spam rule: same payee for 5+ packages in the session, each new or under 1,000 weekly downloads | `refused` | `SPAM` |
| 5 | funding address changed in the last 30 days | `held` | `HELD_CHANGED` |
| 6 | `20 <= toxicScore <= 50`, or token `action == warn` | `held` | `HELD_MEDIUM` |
| 6b | Intercepta has no mainnet history for the address (see below) | `held` | `HELD_NO_HISTORY` |
| 7 | contract on Ethereum with no code on Base (only with `CHECK_NO_CODE=true`) | `held` | `HELD_NO_CODE` |
| 8 | otherwise | `capped` if the split capped it, else `paid` | `CAPPED` / `PAID` |

Every decision made on a successful screen also carries `SCREENED_AS`: "Screened as its mainnet
equivalent (Base, chain 8453)." All user-facing text is in [`lib/messages.ts`](../lib/messages.ts).

### Testnet to mainnet mapping

Intercepta has no testnet chain ids. [`lib/intercepta/mapping.ts`](../lib/intercepta/mapping.ts):

| We pay with | Screened as |
|---|---|
| Base Sepolia, chain `84532` | Base, chain `8453` |
| Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| payee address | the same address; quick scan and impersonation take no chain id |

Every screened result on the roll and in `/history` carries `SCREENED_AS`, so nobody reads a testnet
payment as a mainnet one. Separately, a local pin refuses any payment token that is not Base Sepolia
USDC (`TOKEN_PIN`).

### No history is not an outage

For an address it has never seen on mainnet, quick scan answers HTTP 404 with
`"An Externally Owned Account with this address doesn't exist."`
([probe #3](intercepta-probe.md)). Treated as an error, a fresh payee would have held as
`SCREEN_UNAVAILABLE` or fallen back to a simulation that finds nothing wrong with a plain transfer.
[`lib/intercepta/no-history.ts`](../lib/intercepta/no-history.ts) matches only that 404 and that
message; the client turns it into `noHistory: true`, stores the raw 404, and the matrix holds it as
`HELD_NO_HISTORY`. Any other 404 is still an error. A fresh address is never paid unscreened.

### Live results: first settlement, 26 Sep 2026

Session `9233161f-1de0-4161-abc8-387379cc2b8b`, roll:
https://end-credits.up.railway.app/credits/9233161f-1de0-4161-abc8-387379cc2b8b. Budget 2.00 USDC,
cap 0.25 USDC per package, Base Sepolia. The held and refused rows are our own `@endcredits-demo/*`
fixtures (see [Demo fixtures](details.md#demo-fixtures)); the paid rows are real packages paid to the addresses
their maintainers published.

| Package | Payee | Intercepta said | Outcome | Tx |
|---|---|---|---|---|
| `@tanstack/react-query` | `0xD5371B61b35E13F2ae354BE95081aD63FB383452` (Drips `FUNDING.json`) | `toxicScore` 0, no traits | `capped`, 0.25 USDC over x402 | [`0x9bdb46ae…`](https://sepolia.basescan.org/tx/0x9bdb46ae4da6a54f6adc446d9e69d2280116f6fecfd048ea477f112f6bfe5b1a) |
| `zod` | `0xF233A42130Bcdd8b22FFB5D9593199f31C3Eeb87` (`tea.yaml`) | `toxicScore` 0, no traits | `capped`, 0.25 USDC over x402 | [`0x76fd328d…`](https://sepolia.basescan.org/tx/0x76fd328da02b645ad916d1b45a99cc77aa47e82b7560a8d5bea2f974a91fbe2c) |
| `@endcredits-demo/left-padder-pro` | `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (OFAC SDN, Lazarus Group) | `toxicScore` 100: `sanction_address`, `known_scammer`, `blacklist` | `refused`, nothing sent | none |
| `@endcredits-demo/moved-payout` | `0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551` | clean; the funding address changed during the hackathon | `held` (`HELD_CHANGED`), then released after the owner's MetaMask EIP-712 signature | hold [`0x6fa71613…`](https://sepolia.basescan.org/tx/0x6fa71613ea335e6ec578523522db58ad498e5e98360858f14e4abe7177e986ba), release [`0x4d799e1c…`](https://sepolia.basescan.org/tx/0x4d799e1c9ae1964528ce186aa46e531ce25b7106398b82f00e5ed2f975b5bed0) |
| `date-fns` | none published | not screened (no payee) | `reserved` | [`0x188de0d5…`](https://sepolia.basescan.org/tx/0x188de0d5b6aa202f2d6e5ced162b14e53a4482966223c125f4eb859605018a55) |
| `tailwindcss` | none published | not screened (no payee) | `reserved` | [`0xdc7153e8…`](https://sepolia.basescan.org/tx/0xdc7153e80bf140fe8157c00ac48f166293d2dd23f6972f621fa23c7da1139ae0) |
| `@endcredits-demo/unclaimed-utils` | none published | not screened (no payee) | `reserved` | [`0x94abde52…`](https://sepolia.basescan.org/tx/0x94abde524e0f3bc6b444530fa3b19e576ecfb22cf8a0dbdf39150eeae4dbdafe) |

`recordSession`: [`0x85ddbcf9…`](https://sepolia.basescan.org/tx/0x85ddbcf94abd55c47244296223905698b3d47bd725ccc14b3410755721f11393).

The reasons stored for the two non-paid fixture rows, as the roll shows them (from
`GET /api/sessions/9233161f-1de0-4161-abc8-387379cc2b8b`). Intercepta's trait descriptions go in
verbatim:

```text
@endcredits-demo/left-padder-pro  refused
  Refused. Intercepta: The address has a confirmed history of malicious activity, including scams, phishing, or other harmful behavior.
  Refused. Intercepta: The address is officially listed as sanctioned and poses significant legal and financial risks.
  Refused. Intercepta: The address appears on external or internal blacklist sources due to prior involvement in high‑risk or malicious activity.
  Screened as its mainnet equivalent (Base, chain 8453).

@endcredits-demo/moved-payout  held, then paid
  Held: the funding address for @endcredits-demo/moved-payout changed 0 days ago. Waiting for the owner.
  Screened as its mainnet equivalent (Base, chain 8453).
  Approved by the owner. Released 0.25 USDC to 0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551.
```

The release is covered in [Held money](money.md#held-money-the-owner-signs-the-release-on-chain).

### Live results: the rest of the loop, 26 Sep 2026

| What | Tx |
|---|---|
| A real Claude Code session on the demo app, which asked for its own settlement through the End Credits MCP tools. Session `71993633-1b5b-47bc-b7de-4a3779b8fbfa`: `zod` capped and paid over x402, `@endcredits-demo/moved-payout` held, `@endcredits-demo/left-padder-pro` refused, `date-fns`, `next` and `@endcredits-demo/unclaimed-utils` reserved ([roll](https://end-credits.up.railway.app/credits/71993633-1b5b-47bc-b7de-4a3779b8fbfa)) | `recordSession` [`0x4db2b554…`](https://sepolia.basescan.org/tx/0x4db2b5542e0104d35f9b61b71700bcee6cfe10c759254fd464b8a4379a6bafaf) |
| Rehearsal claim of `@endcredits-demo/unclaimed-rehearsal-1`: GitHub sign-in, wallet, PR, merge, then the reserved 0.25 USDC to the claimed wallet (our deployer key standing in as the maintainer) | `setClaim` [`0x982155da…`](https://sepolia.basescan.org/tx/0x982155da281f9e271a1d1eb0b7cf719cdaa66385be29d24f31b67688add9fea1), `claim` [`0xf0bce1f1…`](https://sepolia.basescan.org/tx/0xf0bce1f17720d8ef505d1cf02d4968ca25026d170ad0dd9bb593b1114456921d) |
| A hold denied by the owner: 0.25 USDC back to the payer, `Refunded(expired=false)` | [`0x4e4cf415…`](https://sepolia.basescan.org/tx/0x4e4cf4155f12abbad590d2bcbf82f470f348e38d3a0189ef1b945d7e22b4afd4) |
| A hold nobody decided, refunded by the expirer worker after its TTL: 0.25 USDC back, `Refunded(expired=true)` | [`0x46c64706…`](https://sepolia.basescan.org/tx/0x46c64706b12d799ff151048034890f45be351ca9b3230fb43230919161ba13dd) |

TODO(live): the final judged demo session id and its roll link.

### What we learned from the docs

- The docs index at `https://docs.web3antivirus.io/llms.txt`, with the OpenAPI JSON behind each
  reference page plus `.md`, was enough to write the client and its schemas before the key arrived.
- There is a dedicated impersonation endpoint (`/poisoning-attack/check-address/{address}`), so an
  address-poisoning payee is refused on Intercepta's word, before our own lookalike rule runs.
- No endpoint takes a testnet chain id, hence the mapping above.
- `/quick-scan` and `/toxic-score` return the same `{toxicScore, traits}` shape and take no chain id.

### Feedback on the API

- **Time to first call:** minutes once the key arrived (it took several hours by email); `llms.txt`
  and the OpenAPI pages via `.md` had the client ready before the first request.
- **What confused us:** an address Intercepta has never seen returns HTTP 404 with an error body, not
  a 200 "no history" verdict, which a client reads as an outage. We special-case it.
- **What was missing for an agent paying on testnet:** testnet chain ids; simulation needs the
  sender's mainnet balance, so a testnet agent's payment cannot be simulated (a substituted funded
  mainnet sender got `WALLET_DRAINER` on a plain transfer to a clean payee, a signal about that
  sender, so payment simulation is off by default); and signature analysis covers Permit but not
  EIP-3009 `TransferWithAuthorization`, the message x402 signs.
- **What worked well:** the impersonation endpoint is fast (about 350 ms in the probe), and the trait
  descriptions are clear enough to show an owner verbatim.
