# Verify it yourself

Every claim in the README, with the transaction or page that proves it. Everything runs on Base
Sepolia (chain 84532); the addresses Intercepta screens are the real mainnet addresses maintainers
publish. Live app: https://end-credits.up.railway.app

## Contracts (verified source)

| Contract | Address | Proof |
|---|---|---|
| `EndCreditsEscrow` v2 | `0x849F6cd44e4A3248d033aBB1b670257F77bFCc46` | [Basescan source](https://sepolia.basescan.org/address/0x849F6cd44e4A3248d033aBB1b670257F77bFCc46#code), Sourcify `exact_match` |
| `EndCreditsBudget` | `0x1429498c0e6f2f474a5bd3230e79a838e3590b36` | [Basescan source](https://sepolia.basescan.org/address/0x1429498c0e6f2f474a5bd3230e79a838e3590b36#code), Sourcify `exact_match` |

Tests: `cd contracts && forge test -vv`. Every guard has a test that asserts its exact custom error,
and a mutation pass (each guard removed in turn) is recorded in `docs/plan/decisions.md`.

## One real session, every outcome

Session `9233161f-1de0-4161-abc8-387379cc2b8b`:
[the credits roll](https://end-credits.up.railway.app/app/credits/9233161f-1de0-4161-abc8-387379cc2b8b).

| What happened | Proof |
|---|---|
| `zod` paid 0.25 USDC over x402 to its real `tea.yaml` payee `0xF233…eb87`, screened clean by Intercepta first | [https://sepolia.basescan.org/tx/0x76fd…be2c](https://sepolia.basescan.org/tx/0x76fd328da02b645ad916d1b45a99cc77aa47e82b7560a8d5bea2f974a91fbe2c) |
| `@tanstack/react-query` paid 0.25 USDC over x402 to its real Drips payee `0xD537…3452` | [https://sepolia.basescan.org/tx/0x9bdb…5b1a](https://sepolia.basescan.org/tx/0x9bdb46ae4da6a54f6adc446d9e69d2280116f6fecfd048ea477f112f6bfe5b1a) |
| `@endcredits-demo/left-padder-pro` refused: Intercepta returns `sanction_address`, `known_scammer`, `blacklist` (toxicScore 100) for the OFAC SDN address it lists; nothing is signed | the roll row, and [`docs/intercepta-probe.md`](docs/intercepta-probe.md) for the raw response |
| `@endcredits-demo/moved-payout` held because its payout address changed, moved into escrow | [hold](https://sepolia.basescan.org/tx/0x6fa71613ea335e6ec578523522db58ad498e5e98360858f14e4abe7177e986ba) |
| released only after the owner's wallet signed the exact tip, payee and amount (EIP-712) | [release](https://sepolia.basescan.org/tx/0x4d799e1c9ae1964528ce186aa46e531ce25b7106398b82f00e5ed2f975b5bed0) |
| `date-fns`, `tailwindcss`, `@endcredits-demo/unclaimed-utils` reserved (no wallet yet) | [reserve](https://sepolia.basescan.org/tx/0x188de0d5b6aa202f2d6e5ced162b14e53a4482966223c125f4eb859605018a55), [reserve](https://sepolia.basescan.org/tx/0xdc7153e80bf140fe8157c00ac48f166293d2dd23f6972f621fa23c7da1139ae0), [reserve](https://sepolia.basescan.org/tx/0x94abde524e0f3bc6b444530fa3b19e576ecfb22cf8a0dbdf39150eeae4dbdafe) |
| the whole session recorded on chain (totals + manifest hash) | [recordSession](https://sepolia.basescan.org/tx/0x85ddbcf94abd55c47244296223905698b3d47bd725ccc14b3410755721f11393) |

## A real Claude Code session that rolled its own credits

Session `71993633-1b5b-47bc-b7de-4a3779b8fbfa`, recorded by the hooks in a real Claude Code session;
the agent called the End Credits MCP tool `end_credits_roll`, then `end_credits_explain`.
[Roll](https://end-credits.up.railway.app/app/credits/71993633-1b5b-47bc-b7de-4a3779b8fbfa),
[zod payment](https://sepolia.basescan.org/tx/0x4d1ac5e103cccdac8166789671ff9464b97038b6433c6aac6574e3a86220b275),
[recordSession](https://sepolia.basescan.org/tx/0x4db2b5542e0104d35f9b61b71700bcee6cfe10c759254fd464b8a4379a6bafaf).

## The owner stays in control of held money

| Path | Proof |
|---|---|
| a release signed by the wrong key reverts `BadApproval`; the approver-signed release pays | [signed release](https://sepolia.basescan.org/tx/0xd8c7087528872b003879e215d7b515e46b20d6728ec26a28f28d9684c648d95d) (the revert is shown in `contracts/test` and in `docs/plan/decisions.md`) |
| the owner denies: the tip goes back | [refund](https://sepolia.basescan.org/tx/0x4e4cf4155f12abbad590d2bcbf82f470f348e38d3a0189ef1b945d7e22b4afd4) |
| nobody approves in time: the worker refunds after expiry | [refund](https://sepolia.basescan.org/tx/0x46c64706b12d799ff151048034890f45be351ca9b3230fb43230919161ba13dd) |

## A maintainer claims reserved money

GitHub sign-in, wallet, one PR adding `FUNDING.json`, merge; then the server screened the wallet with
Intercepta and the recorder set the claim and paid it out:
[setClaim](https://sepolia.basescan.org/tx/0x982155da281f9e271a1d1eb0b7cf719cdaa66385be29d24f31b67688add9fea1),
[claim, 0.25 USDC](https://sepolia.basescan.org/tx/0xf0bce1f17720d8ef505d1cf02d4968ca25026d170ad0dd9bb593b1114456921d).
[Package page](https://end-credits.up.railway.app/app/npm/@endcredits-demo/unclaimed-rehearsal-1).

## Indexed by MultiBaas

The [dashboard](https://end-credits.up.railway.app/dashboard) reads MultiBaas saved event queries over
the escrow and USDC; `GET /api/dashboard` returns the same numbers as JSON. Its paid card counts the
two x402 payments above (0.5 USDC), not the test transfers from the same key.

## Intercepta calls

Live responses captured by `scripts/probe-intercepta.ts`: [`docs/intercepta-probe.md`](docs/intercepta-probe.md).
Every screen the settler runs is stored with its latency and shown on
[history](https://end-credits.up.railway.app/app/history).
