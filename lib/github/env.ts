// OAuth config from env (T10.1). Read per request, so a missing var fails the sign-in only.
import { claimStore } from "../claim/store";
import { db } from "../db/client";
import { readEnv } from "../env";
import type { OAuthConfig } from "./oauth";

export function oauthFromEnv(): OAuthConfig {
  const store = claimStore(db());
  return {
    clientId: readEnv("GITHUB_OAUTH_CLIENT_ID"),
    clientSecret: readEnv("GITHUB_OAUTH_CLIENT_SECRET"),
    appUrl: readEnv("APP_URL"),
    secret: readEnv("SESSION_SECRET"),
    maintainers: { upsert: (m) => store.upsertMaintainer(m) },
  };
}
