// When a funding file reached the default branch, from the GitHub Activity API's server-set push
// timestamps (SPEC §6.3, T2.6). The commits API is used only to learn which commit last touched the
// file; its dates are set by the author and are never read (AGENTS rule 11).
import { authHeaders, type GitHubOpts } from "./github";

const API = "https://api.github.com/repos";
const ZERO_SHA = "0".repeat(40);
const MAX_COMPARES = 10;

type Activity = { before: string; after: string; timestamp: string };

async function getJson<T>(
  url: string,
  opts: GitHubOpts,
): Promise<{ body: T; next: string | null } | null> {
  const res = await (opts.fetch ?? fetch)(url, {
    headers: { accept: "application/vnd.github+json", ...authHeaders(opts.githubToken) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  const next = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  return { body: (await res.json()) as T, next };
}

// Pushes to `branch` newer than `since`, newest first.
async function pushesSince(repo: string, branch: string, since: Date, opts: GitHubOpts) {
  const out: Activity[] = [];
  let url: string | null = `${API}/${repo}/activity?ref=${encodeURIComponent(branch)}&per_page=100`;
  while (url) {
    const page: { body: Activity[]; next: string | null } | null = await getJson<Activity[]>(url, opts);
    if (!page) break;
    for (const a of page.body) {
      if (new Date(a.timestamp) <= since) return out;
      out.push(a);
    }
    url = page.next;
  }
  return out;
}

export async function firstSeenPush(
  repo: string,
  filePath: string,
  opts: GitHubOpts & { since: Date },
): Promise<Date | null> {
  const meta = await getJson<{ default_branch: string }>(`${API}/${repo}`, opts);
  if (!meta) return null;
  const branch = meta.body.default_branch;
  const commits = await getJson<{ sha: string }[]>(
    `${API}/${repo}/commits?path=${encodeURIComponent(filePath)}&sha=${encodeURIComponent(branch)}&per_page=1`,
    opts,
  );
  const sha = commits?.body[0]?.sha;
  if (!sha) return null;

  const pushes = await pushesSince(repo, branch, opts.since, opts);
  const exact = pushes.filter((p) => p.after === sha).at(-1);
  if (exact) return new Date(exact.timestamp);

  // The commit may sit inside a multi-commit push; check the oldest pushes first.
  const candidates = pushes.filter((p) => p.before !== ZERO_SHA).reverse().slice(0, MAX_COMPARES);
  for (const p of candidates) {
    const cmp = await getJson<{ commits: { sha: string }[] }>(
      `${API}/${repo}/compare/${p.before}...${p.after}`,
      opts,
    );
    if (cmp?.body.commits.some((c) => c.sha === sha)) return new Date(p.timestamp);
  }
  return null;
}
