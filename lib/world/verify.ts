// verifyIdToken (DESIGN §14.3). Signature against the issuer's JWKS first, then each claim with its
// own failure code. Everything is checked here on the server; nothing from the browser is trusted.
import { compactVerify, createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { ACR_ORB, worldSettings } from "./config";

export type WorldTokenCode = "SIG" | "ISS" | "AUD" | "EXP" | "NONCE" | "ACR" | "AMR" | "SUB";

export class WorldTokenError extends Error {
  constructor(readonly code: WorldTokenCode | "TOKEN") {
    super(`world id token rejected: ${code}`);
    this.name = "WorldTokenError";
  }
}

export interface VerifiedIdToken {
  iss: string;
  sub: string;
  authTime: number | null;
  acr: string;
  amr: string[];
}

export const EXP_SKEW_SECONDS = 30;

const remoteSets = new Map<string, JWTVerifyGetKey>();

function issuerJwks(issuer: string): JWTVerifyGetKey {
  let set = remoteSets.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    remoteSets.set(issuer, set);
  }
  return set;
}

async function signedClaims(idToken: string, jwks: JWTVerifyGetKey): Promise<Record<string, unknown>> {
  try {
    const { payload } = await compactVerify(idToken, jwks, { algorithms: ["RS256"] });
    const claims: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (typeof claims !== "object" || claims === null || Array.isArray(claims)) throw new Error("claims");
    return claims as Record<string, unknown>;
  } catch {
    throw new WorldTokenError("SIG");
  }
}

function audienceOk(aud: unknown, azp: unknown, clientId: string): boolean {
  if (typeof aud === "string") return aud === clientId;
  if (!Array.isArray(aud)) return false;
  if (aud.length === 1) return aud[0] === clientId;
  // Several audiences: only when every one is us is it ours (azp alone would trust the others).
  return aud.every((a) => a === clientId) && (azp === undefined || azp === clientId);
}

export async function verifyIdToken(
  idToken: string,
  opts: { expectedNonce?: string; jwks?: JWTVerifyGetKey; now?: Date } = {},
): Promise<VerifiedIdToken> {
  const { issuer, clientId } = worldSettings();
  const c = await signedClaims(idToken, opts.jwks ?? issuerJwks(issuer));
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);

  if (c.iss !== issuer) throw new WorldTokenError("ISS");
  if (!audienceOk(c.aud, c.azp, clientId)) throw new WorldTokenError("AUD");
  if (typeof c.exp !== "number" || now >= c.exp + EXP_SKEW_SECONDS) throw new WorldTokenError("EXP");
  if (opts.expectedNonce !== undefined && c.nonce !== opts.expectedNonce) {
    throw new WorldTokenError("NONCE");
  }
  if (c.acr !== ACR_ORB) throw new WorldTokenError("ACR");
  if (!Array.isArray(c.amr) || !c.amr.includes("pop")) throw new WorldTokenError("AMR");
  if (typeof c.sub !== "string" || c.sub.length === 0) throw new WorldTokenError("SUB");

  return {
    iss: c.iss,
    sub: c.sub,
    authTime: typeof c.auth_time === "number" ? c.auth_time : null,
    acr: c.acr,
    amr: c.amr.filter((m): m is string => typeof m === "string"),
  };
}
