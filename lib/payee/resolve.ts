// Payee resolution (DESIGN §7.2). First hit wins: claim, Drips FUNDING.json, tea.yaml, npm funding.
// An invalid address counts as none and resolution moves on; if nothing else is found the result
// carries PAYEE_INVALID. A repo that does not publish the package (T2.5) stops resolution after the
// claim with SPOOF_REPO. Every hit is written to payee_observations.
import type { Address, Hex } from "viem";
import type { MessageCode } from "../messages";
import { registryUrl } from "../registry/npm";
import { fetchRepoFile, rawUrl, type GitHubOpts } from "./github";
import { packageKey } from "./keys";
import type { ObservationStore, PayeeSource } from "./observe";
import { checksum, parseFundingJson, parseNpmFunding, parseTeaYaml, type Parsed } from "./parse";
import { repoPublishes } from "./spoof";

export type PackageRef = {
  id: string;
  name: string;
  repoFullName: string | null;
  repoDirectory: string | null;
  funding: unknown;
};

export type Resolution =
  | { address: Address; source: PayeeSource; sourceUrl: string }
  | { address: null; reason?: MessageCode; vars?: Record<string, string> };

export type ResolveDeps = GitHubOpts & {
  store: ObservationStore;
  claimOf: (key: Hex) => Promise<Address | null>;
};

type Hit = { parsed: Parsed; source: PayeeSource; sourceUrl: string };

export async function resolvePayee(pkg: PackageRef, deps: ResolveDeps): Promise<Resolution> {
  const key = packageKey(pkg.name);
  const repo = pkg.repoFullName;
  let invalid = false;

  const accept = async (hit: Hit | null): Promise<Resolution | null> => {
    if (!hit) return null;
    if (!hit.parsed.address) {
      invalid ||= hit.parsed.reason === "PAYEE_INVALID";
      return null;
    }
    const found = { address: hit.parsed.address, source: hit.source, sourceUrl: hit.sourceUrl };
    await deps.store.record({ packageId: pkg.id, ...found });
    return found;
  };

  const claimed = await deps.claimOf(key);
  const claim = await accept(
    claimed ? { parsed: checksum(claimed), source: "claim", sourceUrl: `claim:${key}` } : null,
  );
  if (claim) return claim;

  if (repo) {
    if (!(await repoPublishes(repo, pkg.repoDirectory, pkg.name, deps))) {
      return { address: null, reason: "SPOOF_REPO", vars: { repo, package: pkg.name } };
    }
    const files: [string, PayeeSource, (text: string) => Parsed][] = [
      ["FUNDING.json", "drips", parseFundingJson],
      ["tea.yaml", "tea", parseTeaYaml],
    ];
    for (const [file, source, parse] of files) {
      const text = await fetchRepoFile(repo, file, deps);
      const hit = await accept(
        text === null ? null : { parsed: parse(text), source, sourceUrl: rawUrl(repo, file) },
      );
      if (hit) return hit;
    }
  }

  const npm = await accept({
    parsed: parseNpmFunding(pkg.funding),
    source: "npm_funding",
    sourceUrl: registryUrl(pkg.name),
  });
  if (npm) return npm;

  return invalid ? { address: null, reason: "PAYEE_INVALID" } : { address: null };
}
