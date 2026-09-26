// T12.1: check each fixture's GitHub repo the way resolution will see it. Reads the local
// fixtures/<name>/package.json for the repository field (the packages may not be on npm yet), then
// runs the anti-spoof check and the FUNDING.json parser against raw.githubusercontent.com HEAD, and
// the full resolvePayee with no claim and an in-memory store.
//
//   pnpm tsx scripts/check-fixtures.ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fetchRepoFile } from "../lib/payee/github";
import type { ObservationStore } from "../lib/payee/observe";
import { parseFundingJson, parseX402Endpoint } from "../lib/payee/parse";
import { resolvePayee } from "../lib/payee/resolve";
import { repoPublishes } from "../lib/payee/spoof";
import { parseRepository } from "../lib/registry/npm";

const FIXTURES = join(__dirname, "..", "fixtures");

const memoryStore: ObservationStore = {
  async record() {},
  async forPackage() {
    return [];
  },
};

async function check(dir: string): Promise<boolean> {
  const pkg = JSON.parse(readFileSync(join(FIXTURES, dir, "package.json"), "utf8"));
  const repo = parseRepository(pkg.repository);
  if (!repo) {
    console.log(`${pkg.name}: no repository field`);
    return false;
  }
  const spoofOk = await repoPublishes(repo.fullName, repo.directory, pkg.name);
  const funding = await fetchRepoFile(repo.fullName, "FUNDING.json");
  const parsed = funding === null ? null : parseFundingJson(funding);
  const res = await resolvePayee(
    { id: pkg.name, name: pkg.name, repoFullName: repo.fullName, repoDirectory: repo.directory, funding: pkg.funding },
    { store: memoryStore, claimOf: async () => null },
  );
  const payee = res.address ? `${res.address} (${res.source})` : `none${res.reason ? ` ${res.reason}` : ""}`;
  const file = funding === null ? "no FUNDING.json" : `FUNDING.json -> ${parsed?.address ?? "none"}`;
  // A local FUNDING.json with an x402 endpoint must reach resolution with the same endpoint.
  const localFunding = join(FIXTURES, dir, "FUNDING.json");
  const wantEndpoint = existsSync(localFunding) ? parseX402Endpoint(readFileSync(localFunding, "utf8")) : null;
  const endpoint = res.address ? (res.x402Endpoint ?? null) : null;
  const endpointOk = endpoint === wantEndpoint;
  const x402 = endpoint || wantEndpoint ? `  x402=${endpoint ?? "none"}${endpointOk ? "" : ` (want ${wantEndpoint})`}` : "";
  console.log(`${pkg.name}  repo=${repo.fullName}  spoof=${spoofOk ? "ok" : "FAIL"}  ${file}  payee=${payee}${x402}`);
  return spoofOk && endpointOk;
}

async function main() {
  const dirs = readdirSync(FIXTURES).filter((d) => statSync(join(FIXTURES, d)).isDirectory()).sort();
  let ok = true;
  for (const d of dirs) ok = (await check(d)) && ok;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
