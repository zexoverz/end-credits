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
