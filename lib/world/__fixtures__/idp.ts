// Test-only World IdP double: a locally generated RS256 keypair, its JWKS served on 127.0.0.1, ID
// tokens signed with it, and a fake token endpoint as an injected fetch. Never used by product code.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { ACR_ORB } from "../config";

export const ISSUER = "https://auth.world.test";
export const CLIENT_ID = "app_test_client";
export const CLIENT_SECRET = "test-secret-not-real";
export const KID = "test-kid";

export interface Idp {
  jwksUrl: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  sign(claims: Record<string, unknown>, opts?: { key?: CryptoKey; kid?: string }): Promise<string>;
  otherKey: CryptoKey;
  close(): Promise<void>;
}

export async function startIdp(): Promise<Idp> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const other = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/jwks.json`;
  return {
    jwksUrl,
    jwks: createRemoteJWKSet(new URL(jwksUrl)),
    otherKey: other.privateKey,
    sign: (claims, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? KID, typ: "JWT" })
        .sign(opts.key ?? privateKey),
    close: () => new Promise((r) => server.close(() => r())),
  };
}

const epoch = (d: Date = new Date()) => Math.floor(d.getTime() / 1000);

/** Claims of a good World ID token; override any of them. */
export function goodClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = epoch();
  return {
    iss: ISSUER,
    sub: "0xsub-owner",
    aud: CLIENT_ID,
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID(),
    auth_time: now,
    acr: ACR_ORB,
    amr: ["pop"],
    ...over,
  };
}

export function worldEnv(): void {
  process.env.WORLD_ISSUER = ISSUER;
  process.env.WORLD_CLIENT_ID = CLIENT_ID;
  process.env.WORLD_CLIENT_SECRET = CLIENT_SECRET;
  process.env.APPROVE_SALT = "salt-for-tests";
}

export interface TokenCall {
  url: string;
  body: URLSearchParams;
  authorization: string | null;
}

/**
 * A fake token (and device authorization) endpoint. `respond` gets the form body and returns the
 * JSON body and status; every call is recorded.
 */
export function fakeTokenEndpoint(
  respond: (body: URLSearchParams, url: string) => Promise<{ status?: number; json: unknown }>,
) {
  const calls: TokenCall[] = [];
  const fetch = async (url: string, init: { body?: unknown; headers?: HeadersInit }) => {
    const body = new URLSearchParams(String(init.body ?? ""));
    const headers = new Headers(init.headers);
    calls.push({ url, body, authorization: headers.get("authorization") });
    const r = await respond(body, url);
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  };
  return { fetch, calls };
}
