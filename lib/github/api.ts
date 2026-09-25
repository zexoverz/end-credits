// Minimal GitHub REST client for the claim flow (DESIGN §13, decisions.md "E10"). fetch is
// injected so tests run against a fake GitHub. Tokens go in the Authorization header only and are
// never part of an error message.

export const GITHUB_API = "https://api.github.com";
export const API_VERSION = "2026-03-10";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`GitHub ${status} for ${path}`);
    this.name = "GitHubError";
  }
}

export type RepoInfo = {
  fullName: string;
  defaultBranch: string;
  permissions: { admin?: boolean; push?: boolean; pull?: boolean } | null;
};

export type PullInfo = {
  number: number;
  url: string;
  merged: boolean;
  mergeCommitSha: string | null;
};

export type FileInfo = { text: string; sha: string };

type Json = Record<string, unknown>;

export function createGitHub(opts: { token?: string; fetch?: typeof fetch; base?: string }) {
  const fetchFn = opts.fetch ?? fetch;
  const base = opts.base ?? GITHUB_API;

  async function call(method: string, path: string, body?: unknown): Promise<Json | Json[]> {
    const res = await fetchFn(base + path, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": API_VERSION,
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new GitHubError(res.status, path);
    return res.status === 204 ? {} : ((await res.json()) as Json);
  }

  const one = async (method: string, path: string, body?: unknown) =>
    (await call(method, path, body)) as Json;

  return {
    async user(): Promise<{ id: number; login: string }> {
      const u = await one("GET", "/user");
      return { id: Number(u.id), login: String(u.login) };
    },

    async repo(repo: string): Promise<RepoInfo> {
      const r = await one("GET", `/repos/${repo}`);
      return {
        fullName: String(r.full_name ?? repo),
        defaultBranch: String(r.default_branch),
        permissions: (r.permissions as RepoInfo["permissions"]) ?? null,
      };
    },

    async branchSha(repo: string, branch: string): Promise<string> {
      const ref = await one("GET", `/repos/${repo}/git/ref/heads/${branch}`);
      return String((ref.object as Json).sha);
    },

    async createBranch(repo: string, branch: string, sha: string): Promise<void> {
      await one("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha });
    },

    // null when the file is not there (404).
    async file(repo: string, path: string, ref: string): Promise<FileInfo | null> {
      try {
        const f = await one("GET", `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
        const text = Buffer.from(String(f.content ?? ""), "base64").toString("utf8");
        return { text, sha: String(f.sha) };
      } catch (e) {
        if (e instanceof GitHubError && e.status === 404) return null;
        throw e;
      }
    },

    async putFile(
      repo: string,
      path: string,
      a: { branch: string; message: string; text: string; sha?: string },
    ): Promise<void> {
      await one("PUT", `/repos/${repo}/contents/${path}`, {
        message: a.message,
        content: Buffer.from(a.text, "utf8").toString("base64"),
        branch: a.branch,
        ...(a.sha ? { sha: a.sha } : {}),
      });
    },

    async createPull(
      repo: string,
      a: { title: string; body: string; head: string; base: string },
    ): Promise<PullInfo> {
      return toPull(await one("POST", `/repos/${repo}/pulls`, a));
    },

    async openPullFrom(repo: string, owner: string, head: string): Promise<PullInfo | null> {
      const q = `head=${encodeURIComponent(`${owner}:${head}`)}&state=open`;
      const list = (await call("GET", `/repos/${repo}/pulls?${q}`)) as Json[];
      return list.length > 0 ? toPull(list[0]) : null;
    },

    async pull(repo: string, n: number): Promise<PullInfo> {
      return toPull(await one("GET", `/repos/${repo}/pulls/${n}`));
    },
  };
}

export type GitHub = ReturnType<typeof createGitHub>;

function toPull(p: Json): PullInfo {
  return {
    number: Number(p.number),
    url: String(p.html_url),
    merged: p.merged === true,
    mergeCommitSha: typeof p.merge_commit_sha === "string" ? p.merge_commit_sha : null,
  };
}
