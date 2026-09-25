// One-off, idempotent MultiBaas setup for the dashboard (T9.1). Run after the escrow is deployed and
// linked as alias `escrow` (contracts/script/Deploy.s.sol):
//   pnpm tsx scripts/multibaas-setup.ts
// Env (or files): MULTIBAAS_URL (~/.config/dominion/multibaas-url), MULTIBAAS_API_KEY
// (~/.config/dominion/multibaas-key, admin group), APP_URL, ESCROW_ADDRESS, and PAYER_ADDRESS or
// PAYER_PRIVATE_KEY (~/.config/dominion/endcredits-payer.key). Prints no key or secret.
//   a) links Base Sepolia USDC as label/alias `usdc` with the ERC-20 ABI, startingBlock "latest";
//   b) PUTs every saved query in lib/multibaas/queries.ts;
//   c) creates webhook `endcredits` → ${APP_URL}/api/webhooks/multibaas on `event.emitted`, and
//      writes the returned secret to ~/.config/dominion/multibaas-webhook-secret (mode 600);
//   d) runs each query once and compares row counts with /count (catches a page-size cap).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { erc20Abi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createMultiBaasClient, MultiBaasError, type MultiBaasClient } from "../lib/multibaas/client";
import { ESCROW_ALIAS, QUERY_LABELS, savedQueries, USDC_ALIAS } from "../lib/multibaas/queries";
import { PAGE_SIZE } from "../lib/multibaas/rows";

const DOMINION = join(homedir(), ".config", "dominion");
const SECRET_FILE = join(DOMINION, "multibaas-webhook-secret");
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WEBHOOK_LABEL = "endcredits";

function fromEnvOrFile(name: string, file: string): string {
  const v = process.env[name] || (existsSync(join(DOMINION, file)) ? readFileSync(join(DOMINION, file), "utf8").trim() : "");
  if (!v) throw new Error(`Missing ${name} (env or ~/.config/dominion/${file})`);
  return v;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function payer(): string {
  if (process.env.PAYER_ADDRESS) return getAddress(process.env.PAYER_ADDRESS);
  const key = fromEnvOrFile("PAYER_PRIVATE_KEY", "endcredits-payer.key") as `0x${string}`;
  return privateKeyToAccount(key).address;
}

const is404 = (e: unknown) => e instanceof MultiBaasError && e.status === 404;

async function exists(mb: MultiBaasClient, path: string): Promise<unknown | undefined> {
  try {
    return await mb.get(path);
  } catch (e) {
    if (is404(e)) return undefined;
    throw e;
  }
}

async function linkUsdc(mb: MultiBaasClient): Promise<void> {
  if (!(await exists(mb, `/contracts/${USDC_ALIAS}`))) {
    await mb.post(`/contracts/${USDC_ALIAS}`, {
      label: USDC_ALIAS,
      contractName: "USDC",
      version: "1.0",
      rawAbi: JSON.stringify(erc20Abi),
      bin: "0x", // MultiBaas rejects a contract without bytecode; USDC is only linked, never deployed
    });
    console.log("usdc: contract ABI uploaded");
  } else console.log("usdc: contract ABI exists, skipped");

  const addr = (await exists(mb, `/chains/ethereum/addresses/${USDC_ALIAS}`)) as
    | { address?: string; contracts?: { label?: string }[] }
    | undefined;
  if (!addr) {
    await mb.post("/chains/ethereum/addresses", { address: USDC, alias: USDC_ALIAS });
    console.log("usdc: address alias created");
  } else if (addr.address && getAddress(addr.address) !== USDC) {
    throw new Error(`alias ${USDC_ALIAS} points at ${addr.address}, not ${USDC}; fix it by hand`);
  }

  if (addr?.contracts?.some((c) => c.label === USDC_ALIAS)) {
    console.log("usdc: already linked, skipped");
    return;
  }
  await mb.post(`/chains/ethereum/addresses/${USDC_ALIAS}/contracts`, {
    label: USDC_ALIAS,
    version: "1.0",
    startingBlock: "latest",
  });
  console.log("usdc: linked with startingBlock latest (events sync from now on)");
}

async function checkEscrow(mb: MultiBaasClient, escrow: string): Promise<void> {
  const addr = (await exists(mb, `/chains/ethereum/addresses/${ESCROW_ALIAS}`)) as { address?: string } | undefined;
  if (!addr) throw new Error(`alias ${ESCROW_ALIAS} not found: deploy and link the escrow first`);
  if (!addr.address || getAddress(addr.address) !== getAddress(escrow)) {
    throw new Error(`alias ${ESCROW_ALIAS} is ${addr.address}, ESCROW_ADDRESS is ${escrow}`);
  }
  console.log(`escrow: alias ${ESCROW_ALIAS} → ${addr.address}`);
}

async function putQueries(mb: MultiBaasClient, payerAddr: string): Promise<void> {
  for (const [label, query] of Object.entries(savedQueries(payerAddr))) {
    await mb.put(`/queries/${label}`, query);
    console.log(`query ${label}: saved`);
  }
}

async function createWebhook(mb: MultiBaasClient, appUrl: string): Promise<void> {
  const url = `${appUrl.replace(/\/+$/, "")}/api/webhooks/multibaas`;
  const hooks = (await mb.get<{ label: string; url: string }[]>("/webhooks")) ?? [];
  const existing = hooks.find((h) => h.label === WEBHOOK_LABEL);
  if (existing) {
    console.log(`webhook ${WEBHOOK_LABEL}: exists (→ ${existing.url}), skipped; secret file ${existsSync(SECRET_FILE) ? "present" : "MISSING"}`);
    return;
  }
  const created = await mb.post<{ secret?: string }>("/webhooks", {
    label: WEBHOOK_LABEL,
    url,
    subscriptions: ["event.emitted"],
  });
  if (!created?.secret) throw new Error("webhook created but no secret in the response");
  mkdirSync(DOMINION, { recursive: true });
  writeFileSync(SECRET_FILE, created.secret, { mode: 0o600 });
  chmodSync(SECRET_FILE, 0o600);
  console.log(`webhook ${WEBHOOK_LABEL}: created → ${url}; a secret was returned and written to ${SECRET_FILE} (600)`);
}

async function verify(mb: MultiBaasClient): Promise<void> {
  for (const label of Object.values(QUERY_LABELS)) {
    try {
      const { rows } = await mb.get<{ rows: unknown[] }>(`/queries/${label}/results?offset=0&limit=${PAGE_SIZE}`);
      const { count } = (await mb.get<{ count?: number }>(`/queries/${label}/count`)) ?? {};
      const capped = typeof count === "number" && count > rows.length && rows.length < PAGE_SIZE;
      console.log(`verify ${label}: ${rows.length} rows, count ${count ?? "?"}${capped ? "  <-- page cap below PAGE_SIZE" : ""}`);
      if (rows[0]) console.log(`  first row keys: ${Object.keys(rows[0] as object).join(", ")}`);
    } catch (e) {
      console.log(`verify ${label}: FAILED ${(e as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  const mb = createMultiBaasClient({
    baseUrl: fromEnvOrFile("MULTIBAAS_URL", "multibaas-url"),
    apiKey: fromEnvOrFile("MULTIBAAS_API_KEY", "multibaas-key"),
  });
  const payerAddr = payer();
  console.log(`payer ${payerAddr}`);
  await checkEscrow(mb, required("ESCROW_ADDRESS"));
  await linkUsdc(mb);
  await putQueries(mb, payerAddr);
  await createWebhook(mb, required("APP_URL"));
  await verify(mb);
}

main().catch((e: unknown) => {
  console.error(`multibaas-setup failed: ${(e as Error).message}`);
  process.exit(1);
});
