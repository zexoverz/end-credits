// Demo state (DESIGN §18), idempotent: `pnpm seed [--write-config]`.
// - Owner "Faisal (demo owner)" paying from PAYER_PRIVATE_KEY's address, 2 USDC per session, 0.25
//   cap, 20 daily, 24 h holds, settle on open. Left alone when it already exists.
// - With --write-config only: a dev agent key (sha256 in agent_keys) written with APP_URL to
//   ~/.endcredits/config.json (mode 600). Skipped when that file already holds a live key of the
//   demo owner. The token is never printed.
// - When ESCROW_ADDRESS is set: payer approves the escrow for 1000 USDC if the allowance is lower.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { allowance, approveEscrow } from "../lib/chain/escrow";
import { chainFromEnv } from "../lib/chain/keys";
import { db } from "../lib/db/client";
import { agentKeys, owners } from "../lib/db/schema";
import { readEnv } from "../lib/env";

const DEMO_OWNER = "Faisal (demo owner)";
const USDC = BigInt(1_000_000);
const APPROVAL = BigInt(1000) * USDC;
const CONFIG = path.join(homedir(), ".endcredits", "config.json");

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

async function ensureOwner(): Promise<string> {
  const [existing] = await db().select({ id: owners.id }).from(owners).where(eq(owners.displayName, DEMO_OWNER));
  if (existing) {
    console.log(`owner exists: ${existing.id}`);
    return existing.id;
  }
  const payer = privateKeyToAccount(readEnv("PAYER_PRIVATE_KEY") as Hex).address;
  const [created] = await db()
    .insert(owners)
    .values({
      displayName: DEMO_OWNER,
      payerAddress: payer,
      sessionBudgetMicro: BigInt(2) * USDC,
      packageCapMicro: USDC / BigInt(4),
      dailyLimitMicro: BigInt(20) * USDC,
      holdTtlSeconds: 86_400,
      settleMode: "on_open",
    })
    .returning({ id: owners.id });
  console.log(`owner created: ${created.id} (payer ${payer})`);
  return created.id;
}

function configuredKey(): string | null {
  if (!existsSync(CONFIG)) return null;
  try {
    const parsed = JSON.parse(readFileSync(CONFIG, "utf8"));
    return typeof parsed.agentKey === "string" ? parsed.agentKey : null;
  } catch {
    return null;
  }
}

async function ensureAgentKey(ownerId: string): Promise<void> {
  const current = configuredKey();
  if (current) {
    const [live] = await db()
      .select({ id: agentKeys.id })
      .from(agentKeys)
      .where(and(eq(agentKeys.tokenHash, sha256(current)), eq(agentKeys.ownerId, ownerId), isNull(agentKeys.revokedAt)));
    if (live) {
      console.log(`agent key already in ${CONFIG}`);
      return;
    }
  }
  const token = `ec_${randomBytes(32).toString("base64url")}`;
  await db().insert(agentKeys).values({ ownerId, label: "demo laptop (seed)", tokenHash: sha256(token), boundVia: "dev" });
  mkdirSync(path.dirname(CONFIG), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG, `${JSON.stringify({ apiUrl: readEnv("APP_URL").replace(/\/+$/, ""), agentKey: token }, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(CONFIG, 0o600);
  console.log(`agent key written to ${CONFIG}`);
}

async function ensureAllowance(): Promise<void> {
  const ctx = chainFromEnv();
  const current = await allowance(undefined, ctx);
  if (current >= APPROVAL) {
    console.log(`escrow allowance ${formatUnits(current, 6)} USDC, nothing to do`);
    return;
  }
  console.log(`approve tx ${await approveEscrow(APPROVAL, ctx)}`);
}

async function main() {
  const ownerId = await ensureOwner();
  if (process.argv.includes("--write-config")) await ensureAgentKey(ownerId);
  if (process.env.ESCROW_ADDRESS) await ensureAllowance();
  process.exit(0);
}

main().catch((err) => {
  // viem's shortMessage leaves out request details (RPC URLs can carry keys); ours are env names.
  const short = (err as { shortMessage?: string }).shortMessage;
  console.error(`seed failed: ${short ?? (err instanceof Error ? err.message : "error")}`);
  process.exit(1);
});
