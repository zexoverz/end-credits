// Raw file reads from a repo's default branch. 404 means the file is not there.

export type GitHubOpts = { fetch?: typeof fetch; githubToken?: string };

export function rawUrl(repo: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${repo}/HEAD/${filePath}`;
}

export function authHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function fetchRepoFile(
  repo: string,
  filePath: string,
  opts: GitHubOpts = {},
): Promise<string | null> {
  const url = rawUrl(repo, filePath);
  const res = await (opts.fetch ?? fetch)(url, { headers: authHeaders(opts.githubToken) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return res.text();
}
