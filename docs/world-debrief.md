# World ID debrief (E11)

Notes kept while building World ID for Agents into End Credits. The backend parts were written
before any live World App run; lines marked **(live)** are for the human to fill after one.

## Time to first success

- Discovery doc to a green integration suite (sign-in, approval step-up with its denied paths,
  device grant) against a local IdP double: one working session, 26 Sep.
- First real sign-in with World App on the fixed domain: **(live)**
- First approval released on the phone: **(live)**
- First `endcredits login` through the device grant: **(live)**

## Friction

- The production portal URL was not in the docs we had; the sandbox one
  (`https://sandbox.auth.world.org/portal`) was. **(live: confirm the production one)**
- HTTPS-only, exact-match callbacks and a pairwise `sub` per hostname mean nothing can be tried on
  localhost or a preview URL. Sign-in and approval must share one hostname or the owner's `sub`
  changes between them. Everything before the live run was tested against a local IdP double.
- `openid-client`'s `client_secret_basic` percent-encodes `_`, so a World client id `app_…` goes out
  as `app%5F…` in the Basic header. We send the id unencoded (`encodeURIComponent` only) to avoid
  depending on the server form-decoding it. **(live: did the default work too?)**
- The device grant ignores `nonce`, `max_age` and `prompt`, so it cannot bind one approval. We use it
  only for CLI login and keep approvals on the code flow with a bound nonce.

## Missing docs

- Whether the device grant's ID token carries `acr` (orb-v3) and `amr` (`pop`). We require both.
  **(live)**
- Whether `auth_time` is always in the ID token, in particular after `max_age=0` and
  `prompt=login`. The approval refuses without it. **(live)**
- The exact `error` value on the callback when the user cancels in World App (we treat any `error`
  as cancelled). **(live)**
- `max_age` is not in the discovery doc, while SPEC §9.1 says freshness works through it.
- Whether `verification_uri_complete` and `interval` come back from `device_authorization`.

## One improvement

- **(live, pick one)** Candidate: document the ID token claims per grant (code vs device) with an
  example token for each, including `auth_time` and `acr` / `amr`, so a relying party can write its
  checks before its first live run.
