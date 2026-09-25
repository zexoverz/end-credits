// Payee resolution (DESIGN §7.2). First hit wins: claim, Drips FUNDING.json, tea.yaml, npm funding.
// An invalid address counts as none and resolution moves on; if nothing else is found the result
// carries PAYEE_INVALID. Every hit is written to payee_observations.
import type { Address, Hex } from "viem";
import type { MessageCode } from "../messages";
import { registryUrl } from "../registry/npm";
import { fetchRepoFile, rawUrl, type GitHubOpts } from "./github";
import { packageKey } from "./keys";
import type { ObservationStore, PayeeSource } from "./observe";
import { checksum, parseFundingJson, parseNpmFunding, parseTeaYaml, type Parsed } from "./parse";

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

type Step = () => Promise<{ parsed: Parsed; source: PayeeSource; sourceUrl: string } | null>;

export async function resolvePayee(pkg: PackageRef, deps: ResolveDeps): Promise<Resolution> {
  const key = packageKey(pkg.name);
  const repo = pkg.repoFullName;
  const repoFile = (file: string, source: PayeeSource, parse: (t: string) => Parsed): Step =>
    async () => {
      if (!repo) return null;
      const text = await fetchRepoFile(repo, file, deps);
      return text === null ? null : { parsed: parse(text), source, sourceUrl: rawUrl(repo, file) };
    };

  const steps: Step[] = [
    async () => {
      const claimed = await deps.claimOf(key);
      return claimed ? { parsed: checksum(claimed), source: "claim", sourceUrl: `claim:${key}` } : null;
    },
    repoFile("FUNDING.json", "drips", parseFundingJson),
    repoFile("tea.yaml", "tea", parseTeaYaml),
    async () => ({
      parsed: parseNpmFunding(pkg.funding),
      source: "npm_funding",
      sourceUrl: registryUrl(pkg.name),
    }),
  ];

  let invalid = false;
  for (const step of steps) {
    const hit = await step();
    if (!hit) continue;
    if (hit.parsed.address) {
      const { address } = hit.parsed;
      await deps.store.record({ packageId: pkg.id, address, source: hit.source, sourceUrl: hit.sourceUrl });
      return { address, source: hit.source, sourceUrl: hit.sourceUrl };
    }
    invalid ||= hit.parsed.reason === "PAYEE_INVALID";
  }
  return invalid ? { address: null, reason: "PAYEE_INVALID" } : { address: null };
}
