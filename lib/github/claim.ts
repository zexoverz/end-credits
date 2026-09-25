// The GitHub side of a maintainer claim (DESIGN §13): the push check, the FUNDING.json pull
// request (or the prefilled new-file link when the token cannot write), and reading the file back.
import { getAddress, type Address } from "viem";
import { parseFundingJson } from "../payee/parse";
import { GitHubError, type GitHub } from "./api";

export const CLAIM_BRANCH = "endcredits/funding-json";
export const FUNDING_PATH = "FUNDING.json";
export const PR_TITLE = "Add FUNDING.json";
export const PR_BODY = [
  "Adds a Drips-format FUNDING.json so End Credits can send what coding agents set aside for this project to the maintainer's wallet.",
  "It only adds a wallet address; nothing else in the repository changes.",
].join("\n");

export function fundingJson(wallet: Address): string {
  return JSON.stringify({ drips: { ethereum: { ownedBy: wallet } } }) + "\n";
}

// GitHub's web editor, prefilled. `filename` and `value` are not in GitHub's docs (decisions.md, E10).
export function newFileUrl(repo: string, base: string, wallet: Address): string {
  const q = `filename=${FUNDING_PATH}&value=${encodeURIComponent(fundingJson(wallet))}`;
  return `https://github.com/${repo}/new/${encodeURIComponent(base)}?${q}`;
}

export async function canPush(api: GitHub, repo: string) {
  const r = await api.repo(repo);
  return { ok: !!(r.permissions?.push || r.permissions?.admin), defaultBranch: r.defaultBranch };
}

export type OpenedPr =
  | { mode: "api"; base: string; number: number; url: string }
  | { mode: "new_file_link"; base: string; url: string };

// Branch, file, pull request. Each step reuses what an earlier attempt left behind, so a retry
// converges on one PR. A 403 or 404 anywhere means the token cannot write here (org OAuth
// restrictions, typically): fall back to the new-file link.
export async function openFundingPr(api: GitHub, repo: string, wallet: Address): Promise<OpenedPr> {
  const base = (await api.repo(repo)).defaultBranch;
  try {
    const sha = await api.branchSha(repo, base);
    await api.createBranch(repo, CLAIM_BRANCH, sha).catch(ignoreStatus(422)); // exists: reuse
    const text = fundingJson(wallet);
    const current = await api.file(repo, FUNDING_PATH, CLAIM_BRANCH);
    if (current?.text !== text) {
      await api.putFile(repo, FUNDING_PATH, {
        branch: CLAIM_BRANCH,
        message: PR_TITLE,
        text,
        sha: current?.sha,
      });
    }
    const pr = await api
      .createPull(repo, { title: PR_TITLE, body: PR_BODY, head: CLAIM_BRANCH, base })
      .catch(async (e) => {
        if (!(e instanceof GitHubError && e.status === 422)) throw e;
        const open = await api.openPullFrom(repo, repo.split("/")[0], CLAIM_BRANCH);
        if (!open) throw e;
        return open;
      });
    return { mode: "api", base, number: pr.number, url: pr.url };
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) {
      return { mode: "new_file_link", base, url: newFileUrl(repo, base, wallet) };
    }
    throw e;
  }
}

export type FundingRead =
  | { present: false }
  | { present: true; address: Address | null; sha: string };

export async function readFunding(api: GitHub, repo: string, ref: string): Promise<FundingRead> {
  const f = await api.file(repo, FUNDING_PATH, ref);
  if (!f) return { present: false };
  const parsed = parseFundingJson(f.text);
  return { present: true, address: parsed.address ? getAddress(parsed.address) : null, sha: f.sha };
}

function ignoreStatus(status: number) {
  return (e: unknown) => {
    if (!(e instanceof GitHubError && e.status === status)) throw e;
  };
}
