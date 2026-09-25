// Code for tokens at World's token endpoint, then our own verifyIdToken on the ID token. openid-client
// checks state, PKCE, iss, aud, exp and nonce during the exchange too; a claim it rejects is mapped to
// the same code verifyIdToken would give, so the page shows one message either way. The code, the
// verifier and the tokens are never logged.
import * as client from "openid-client";
import type { WorldDeps } from "./config";
import { verifyIdToken, WorldTokenError, type VerifiedIdToken, type WorldTokenCode } from "./verify";

const CLAIM_CODES: Record<string, WorldTokenCode> = {
  nonce: "NONCE",
  iss: "ISS",
  aud: "AUD",
  azp: "AUD",
  exp: "EXP",
};

/** The failed claim behind an openid-client error, when there is one. */
function claimOf(err: unknown): string | undefined {
  const cause = (err as { cause?: { cause?: { claim?: unknown } } })?.cause?.cause;
  return typeof cause?.claim === "string" ? cause.claim : undefined;
}

export function mapClientError(err: unknown): WorldTokenError {
  if (err instanceof WorldTokenError) return err;
  const claim = claimOf(err);
  return new WorldTokenError((claim && CLAIM_CODES[claim]) || "TOKEN");
}

export interface CodeChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function exchangeCode(
  config: client.Configuration,
  callbackUrl: URL,
  checks: CodeChecks,
  deps: WorldDeps,
): Promise<VerifiedIdToken> {
  let idToken: string | undefined;
  try {
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    idToken = tokens.id_token;
  } catch (err) {
    throw mapClientError(err);
  }
  if (!idToken) throw new WorldTokenError("TOKEN");
  return verifyIdToken(idToken, { expectedNonce: checks.nonce, jwks: deps.jwks, now: deps.now?.() });
}
