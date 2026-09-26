// Provisioner loop (multi-owner): every 5 s, get each new owner's payer key ready (gas, approver,
// escrow approval). Owners already ready are remembered for the life of the process.
import { defaultProvisionDeps } from "../lib/owner/provision-deps";
import { provisionAll } from "../lib/owner/provision";
import { startLoop, type Loop } from "./loop";

export const PROVISION_INTERVAL_MS = 5_000;

export function startProvisioner(log: (line: string) => void = console.error): Loop {
  const deps = defaultProvisionDeps(log);
  const ready = new Set<string>();
  return startLoop("provisioner", PROVISION_INTERVAL_MS, () => provisionAll(deps, ready), log);
}
