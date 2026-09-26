// Provisioner loop (multi-owner): every 5 s, get each new owner's payer key ready (gas, approver,
// escrow approval), then keep MultiBaas `paid_totals` filtering every owner's payer. Owners already
// ready are remembered for the life of the process.
import { db } from "../lib/db/client";
import { owners } from "../lib/db/schema";
import { multibaasFromEnv } from "../lib/multibaas/client";
import { paidQuerySync } from "../lib/multibaas/sync";
import { defaultProvisionDeps } from "../lib/owner/provision-deps";
import { provisionAll } from "../lib/owner/provision";
import { startLoop, type Loop } from "./loop";

export const PROVISION_INTERVAL_MS = 5_000;

export function startProvisioner(log: (line: string) => void = console.error): Loop {
  const deps = defaultProvisionDeps(log);
  const ready = new Set<string>();
  const payers = async () => (await db().select({ p: owners.payerAddress }).from(owners)).map((r) => r.p);
  const sync = process.env.MULTIBAAS_URL ? paidQuerySync(multibaasFromEnv(), payers) : null;
  return startLoop(
    "provisioner",
    PROVISION_INTERVAL_MS,
    async () => {
      await provisionAll(deps, ready);
      if (sync && (await sync().catch((e) => (log(`provisioner: paid_totals not saved: ${e instanceof Error ? e.name : "error"}`), false)))) {
        log("provisioner: paid_totals saved for every payer");
      }
    },
    log,
  );
}
