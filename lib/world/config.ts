// World ID OIDC client settings (SPEC §9.1, discovery doc pinned in decisions.md E11). The endpoints
// are fixed paths under WORLD_ISSUER, so no discovery request runs at boot. Secrets are read here and
// never logged.
import * as client from "openid-client";
import type { JWTVerifyGetKey } from "jose";
import { readEnv } from "../env";

export const ACR_ORB = "https://world.org/oidc/acr/orb-v3";
export const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** Test seams. Production passes nothing: real fetch, the issuer's JWKS, the wall clock. */
export interface WorldDeps {
  fetch?: client.CustomFetch;
  jwks?: JWTVerifyGetKey;
  now?: () => Date;
}

export interface WorldSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

export function worldSettings(): WorldSettings {
  return {
    issuer: readEnv("WORLD_ISSUER").replace(/\/+$/, ""),
    clientId: readEnv("WORLD_CLIENT_ID"),
    clientSecret: readEnv("WORLD_CLIENT_SECRET"),
  };
}

export function serverMetadata(issuer: string): client.ServerMetadata {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/v1/authorize`,
    token_endpoint: `${issuer}/api/v1/token`,
    device_authorization_endpoint: `${issuer}/api/v1/device_authorization`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    id_token_signing_alg_values_supported: ["RS256"],
  };
}

/**
 * `client_secret_basic` with `encodeURIComponent` on id and secret. openid-client's own also encodes
 * `-`, `_`, `.`, `~` (RFC 6749 §2.3.1), which a server that does not form-decode the header would
 * read as a different client id (`app_…` becomes `app%5F…`). Both kinds of server read this one
 * the same for id and secret made of unreserved characters.
 */
export function basicAuth(clientId: string, clientSecret: string): client.ClientAuth {
  const value = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
  const header = `Basic ${Buffer.from(value).toString("base64")}`;
  return (_as, _client, _body, headers) => {
    headers.set("authorization", header);
  };
}

/** Confidential client, `client_secret_basic` (DESIGN §14.1). */
export function worldConfig(deps: WorldDeps = {}): client.Configuration {
  const s = worldSettings();
  const config = new client.Configuration(
    serverMetadata(s.issuer),
    s.clientId,
    undefined,
    basicAuth(s.clientId, s.clientSecret),
  );
  config.timeout = 10;
  if (deps.fetch) config[client.customFetch] = deps.fetch;
  return config;
}

const appUrl = () => readEnv("APP_URL").replace(/\/+$/, "");

/** Both callbacks sit on the one fixed hostname, so the pairwise `sub` is the same (DESIGN §14.2). */
export const signInRedirectUri = () => `${appUrl()}/api/auth/world/callback`;
export const approveRedirectUri = () => `${appUrl()}/api/approve/callback`;

/**
 * The callback URL as World called it, rebuilt on APP_URL. Behind the Railway proxy `req.url` carries
 * the internal host, which would not match the registered `redirect_uri` at the token endpoint.
 */
export function publicCallbackUrl(req: Request, redirectUri: string): URL {
  const url = new URL(redirectUri);
  url.search = new URL(req.url).search;
  return url;
}

export const appPath = (path: string) => `${appUrl()}${path}`;
