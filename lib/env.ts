// Env contract (DESIGN §2). Each process checks what it needs at boot; any other var throws the
// same named error the first time it is read.

export const WEB_BOOT = ["APP_URL", "DATABASE_URL", "SESSION_SECRET"] as const;

export const WORKER_BOOT = [
  "APP_URL",
  "DATABASE_URL",
  "INTERCEPTA_API_KEY",
  "INTERCEPTA_BASE",
  "BASE_SEPOLIA_RPC",
  "USDC_ADDRESS",
  "ESCROW_ADDRESS",
  "PAYER_PRIVATE_KEY",
  "RECORDER_PRIVATE_KEY",
  "X402_FACILITATOR_URL",
] as const;

export const WORLD_VARS = [
  "WORLD_ISSUER",
  "WORLD_CLIENT_ID",
  "WORLD_CLIENT_SECRET",
  "APPROVE_SALT",
] as const;

type Env = Record<string, string | undefined>;

export function checkEnv(names: readonly string[], env: Env = process.env): void {
  const required = env.WORLD_REQUIRED === "true" ? [...names, ...WORLD_VARS] : names;
  for (const name of required) readEnv(name, env);
}

export function readEnv(name: string, env: Env = process.env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}
