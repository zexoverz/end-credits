# Decisions made during the build

Choices confirmed while building, each with its source. The plan in this folder is not edited.

## E0 (26 Sep)

- **Stack:** Next.js 16.3 App Router, pnpm 10 workspace (`.` and `cli/`), vitest, Drizzle 0.45 on
  postgres.js, Railway project `end-credits`, fixed domain `https://end-credits.up.railway.app`.
- **Amounts in the DB are micro-USDC `bigint` columns (`*_micro`)**, not `numeric` USDC, so the split
  and the chain use the same integers. bytes32 values (`session_key`, `package_key`, `tip_id`,
  hashes) are stored as `0x` hex text.
- `sessions.settle_requested_at` added: the settler picks up a session when this is set (on upload
  in `auto` mode, on **Roll credits** in `on_open` mode).
- **Env check:** the web boot checks `APP_URL`, `DATABASE_URL`, `SESSION_SECRET`; the worker boot
  checks everything it signs or screens with. Every other var throws the same
  `Missing required env: <NAME>` on first read. World vars join the boot check when
  `WORLD_REQUIRED=true`. Reason: callbacks need the deployed domain before MultiBaas, GitHub and
  World credentials exist.
- **Keys:** the deployer and faucet is the `ethglobal-tokyo` keystore
  (`0xfa064a16bDeD4C82aa6b3D4c656a640CeD547A13`). The server-held keys are fresh testnet keys made
  for this app, never exported from a keystore: payer `0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6`,
  recorder `0xc8e1Bc6B6c1AD5275935B313288b2c6FF45472A8`, receipt signer
  `0xCD5f2A9eB66463aea82a6E41E03D42b798cD6725`.
- **Payer USDC** came from a Uniswap v3 swap on Base Sepolia (WETH/USDC 0.3% pool
  `0x46880b404CD35c165EDdefF7421019F8dD25F4Ad`), tx
  `0x08751f72aa510e92fd09ad76945049bd6124b28bdb88ea75cd6765ec2c34d740`, 65.5 USDC. faucet.circle.com
  needs a captcha.

## CONFIRM: Claude Code hooks (T1.1)

Source: https://code.claude.com/docs/en/hooks and /docs/en/tools-reference, Claude Code 2.1.282.

- Events `SessionStart`, `PostToolUse`, `SessionEnd`; settings shape as in DESIGN §4.1. A matcher of
  only letters, digits, `_`, `-`, `,`, `|` is an exact-name list.
- stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`; `SessionStart` adds `source`;
  `PostToolUse` adds `tool_name`, `tool_input`, `tool_response`, `tool_use_id` (file paths are
  absolute); `SessionEnd` adds `reason`.
- `tool_input`: Read `file_path`; Write `file_path`, `content`; Edit `file_path`, `new_string`;
  Grep/Glob `pattern`, `path?`; WebFetch `url`; Bash `command`. `MultiEdit` no longer exists (kept in
  the matcher, harmless).
- **On macOS and Linux, Glob and Grep are not in the default tool set; searches arrive as `Bash`
  calls.** `record` therefore also takes `node_modules/<pkg>` paths out of `Bash` commands.
- `SessionStart` stdout is added to Claude's context: `start` prints nothing.
- **`SessionEnd` has a 1.5 s default budget and its output is discarded.** `init` writes
  `"timeout": 15` on the SessionEnd handler; `settle` hands the upload and `open <url>` to a detached
  child so the hook returns at once. The opened tab is the user-visible signal.

## CONFIRM: x402 v2 (T5.1)

- Packages `@x402/core`, `@x402/evm`, `@x402/fetch` (and `@x402/next` if used) pinned `~2.27.0`
  (published 2026-09-22). `x402`, `x402-fetch`, `x402-next` are v1 and not used.
- Headers: `PAYMENT-REQUIRED` (base64 JSON challenge), `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`.
- Challenge: `{x402Version, resource:{url, description}, accepts:[{scheme, network, asset, amount,
  payTo, maxTimeoutSeconds, extra}]}`. `amount` is atomic units as a string. `extra` must be
  `{name:"USDC", version:"2"}` (verified on chain: domain separator matches
  `("USDC","2",84532,0x036C…CF7e)`).
- Facilitator `https://x402.org/facilitator`; `/supported` lists `exact` on `eip155:84532`.
- Pre-sign check: `x402Client.onBeforePaymentCreation` returns `{abort:true, reason}` before the
  signer runs. Default `spendControls` refuse payments over $1; set `maxAmountPerPayment: false`
  since our hook is the gate.

## CONFIRM: tea.yaml and FUNDING.json (T2.2)

- tea.yaml (zod, qs, Inquirer.js): `version`, `codeOwners` (list of quoted address strings, may
  carry YAML comments), `quorum`. Parsed with `yaml`, not a regex.
- FUNDING.json (prettier, TanStack/query, vitest): `{"drips":{"ethereum":{"ownedBy":"0x…"}}}`. Drips
  also reads other network keys (`filecoin`, `optimism`, …); we read `ethereum` first, then any other
  `drips.*.ownedBy`.

## E2 and E3 (26 Sep)

- **Registry:** `repository` is read from the requested version (default `latest`), falling back to
  the top-level doc; `funding` the same. Repo names are lowercased, as in `measure-funding.py`.
  Funding links keep only `github.com/sponsors/*` and `opencollective.com/*`. In-memory 1 h cache
  keyed by `name@version`.
- **Addresses:** a mixed-case address with a wrong EIP-55 checksum, and the zero address, are
  `PAYEE_INVALID` (strict viem `isAddress`, then `getAddress`). A typo is not a payee.
- **Invalid falls through:** an invalid address in `FUNDING.json` does not stop resolution; tea and
  npm funding are still tried. `PAYEE_INVALID` is returned only when nothing valid is found.
- **GitHub errors:** a raw-file 404 is "no file"; any other status throws so the caller retries,
  rather than reading an outage as "no payee".
- **Claim observation** `source_url` is `claim:<packageKey>`.
- **Anti-spoof (T2.5):** checked after the claim and before the repo files. Mismatch, missing
  `package.json`, or unparsable JSON → no payee, `SPOOF_REPO`, and npm funding is not tried either.
  Exception: a root `package.json` with `"private": true` and no `repository.directory` is a workspace
  root and passes unchecked. Without it `zod` (root has no name) and `date-fns` (root is
  `@date-fns/root`) would both be reserved as spoofs. A claim is not subject to the check.
- **Change window:** `days` counts from the first observation of the new address after the last
  observation of the old one.

### CONFIRM: GitHub Activity API (T2.6)

Checked with `gh api` on 26 Sep. `GET /repos/{o}/{r}/activity?ref=<branch>` returns
`{before, after, ref, timestamp, activity_type, actor}` per push, newest first, cursor-paginated via
the `Link` header; `activity_type` is one of `push`, `force_push`, `pr_merge`, `branch_creation`,
`branch_deletion`, … Works unauthenticated (60/h). History reaches back to at least March 2023
(prettier, qs). It has no path filter.

- `ljharb/qs` `tea.yaml`: commit `c4d29f35ac`, commit date `2024-03-19T19:51:35Z`; the activity entry
  with `after = c4d29f35ac` is a `force_push` at `2024-03-19T23:39:26Z`. The server time differs from
  the commit date, which is the point.
- `prettier/prettier` `FUNDING.json`: commit `d498b6f2a5`, a `pr_merge` at `2024-04-04T13:55:00Z`.

`firstSeenPush(repo, path, {since})` (`lib/payee/push.ts`): the commits API gives only the SHA of the
last commit touching the file on the default branch (its dates are never read); the Activity API is
paged back to `since`; the push whose `after` is that SHA wins, else up to 10 pushes are checked with
the compare API for the SHA inside a multi-commit push. Not found inside the window → `null`.

`recentlyChanged` calls it only when no different address is in the window and our first observation
of the package is younger than 30 days (so "never observed" included). Push inside 30 days →
changed, `days` from the push. Two consequences:
- the last commit touching the file may be a formatting change, which then reads as a change; the
  cost is a hold, not a payment.
- a fixture repo created this week with a `FUNDING.json` holds on first sight. Fine for
  `moved-payout` (held anyway) and `left-padder-pro` (refused first).

### Split (T3.1)

- The over-cap test is exact (`remaining × score > cap × total`), not on the floored share, so the
  result equals continuous water-filling floored once; that is what makes the monotonic property
  hold exactly.
- A capped amount under the dust floor (cap < 0.01) is `dust`, not `capped`. Dust is not
  redistributed. Zero scores are left out of the result. Non-integer scores and negative money throw.
- Guard checks, done by hand: replacing the over-cap filter with `[]` fails "never pays more than
  the cap" and the two cap cases; replacing `amount < DUST_FLOOR` with `false` fails "never sends a
  nonzero amount under the dust floor" and the two dust cases. Removing the 30-day window in
  `recentlyChanged` fails "last seen over 30 days ago is not a change".
## E1

- **Ledger.** One line per tool call at most. A Bash install wins over Bash reads. Reads pulled out
  of Bash become `{t:"read", ps:[…]}` (up to 20 paths), only from segments whose command is a reader
  (`cat head tail less more grep egrep rg ag find fd ls tree sed awk wc bat file stat jq`), so
  `rm -rf node_modules/x` is not a read. Grep/Glob use `path`, then `pattern`.
- `start` keeps the first snapshot when a session resumes (SessionStart fires again on
  resume/clear/compact).
- **Settle.** The hook writes `<id>.end.json` (`endedAt`, `cwd`) and spawns a detached
  `endcredits settle --session <id>`, returning in ~90 ms. On success the child writes
  `<id>.done.json` and deletes the ledger, start and end files; a later retry reopens the same roll
  without uploading. On failure everything is kept and the error goes to `errors.log`. A session
  with no installed package used uploads nothing. The opened URL must be on the configured `apiUrl`
  origin, else `{apiUrl}/credits/<id>` is opened. `ENDCREDITS_NO_OPEN=1` skips the tab.
- **Timing.** The bundled `record` process, node boot included, takes ~36 ms on a 1 MB Write.
- **repoLabel** is the `name` in `cwd/package.json`, omitted when absent. Never a path.
- **Docs mapping.** A `homepage` on a shared host (github.com, gitlab.com, bitbucket.org,
  npmjs.com, unpkg.com, cdn.jsdelivr.net) is not a host match; a GitHub homepage counts as the repo
  URL. unpkg and jsdelivr also match `/<name>/…` and `/<name>`. An ambiguous match is sent as
  evidence `ambiguous <url>`. "Name in the path" checks the full name or the part after the scope.
- **dep_added** follows DESIGN §5 literally: `(end − start) ∪ add lines`, so an install command for a
  package already present still counts once. `import` sends no evidence (file hashes stay local).
- **session_key** = `keccak256` of the UTF-8 bytes of the `sessions.id` uuid string (viem
  `keccak256(stringToBytes(id))`).
- **POST /api/sessions** answers 201 when created, 200 with the same `{id, url}` on a re-upload.
  Idempotency is the `(owner_id, claude_session_id)` unique key with `ON CONFLICT DO NOTHING`, one
  path for retries and races. Errors are machine codes (`unauthorized`, `invalid_body`,
  `invalid_json`, `too_large`), not UI text. Body ≤ 2 MB; evidence ≤ cap entries of ≤ 512 chars.
- **GET /api/sessions/:id**: amounts via `formatUnits(micro, 6)` (`"0.25"`), payee `0x1234…5678`,
  404 for a non-uuid id. `credits` is empty until the settler writes them.
- CLI output lives in `CLI_MESSAGES` in `lib/messages.ts`, apart from the DESIGN §11 codes.
- `next dev` rewrites the repo `AGENTS.md` (Next 16 `agentRules`). Not changed here; revert it or
  set `agentRules: false` in `next.config.ts`.
