// Production wiring for the dashboard and the webhook: MultiBaas from env, Postgres, env addresses.
import { payerAccount } from "../chain/keys";
import { readEnv } from "../env";
import { multibaasFromEnv } from "./client";
import { invalidateDashboardCache, type DashboardDeps } from "./dashboard";
import { drizzleDashboardRepo, drizzleWebhookRepo } from "./repo";
import type { WebhookDeps } from "./webhook";

/** PAYER_ADDRESS when set, else derived from PAYER_PRIVATE_KEY (never logged). */
export function payerAddress(env: Record<string, string | undefined> = process.env): string {
  return env.PAYER_ADDRESS || payerAccount(env).address;
}

export function defaultDashboardDeps(): DashboardDeps {
  return {
    mb: multibaasFromEnv(),
    repo: drizzleDashboardRepo(),
    payer: payerAddress(),
    escrow: readEnv("ESCROW_ADDRESS"),
  };
}

export function defaultWebhookDeps(): WebhookDeps {
  return {
    repo: drizzleWebhookRepo(),
    secret: readEnv("MULTIBAAS_WEBHOOK_SECRET"),
    invalidate: invalidateDashboardCache,
  };
}
