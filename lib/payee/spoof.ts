// Package -> repo anti-spoof (SPEC §6.2, P1): the repo's package.json at HEAD, under
// repository.directory, must declare the package's name. A private root package.json with no
// directory given is a workspace root (colinhacks/zod, date-fns/date-fns) and cannot be checked
// without walking the workspace, so it passes.
import { fetchRepoFile, type GitHubOpts } from "./github";

export async function repoPublishes(
  repo: string,
  directory: string | null,
  name: string,
  opts: GitHubOpts = {},
): Promise<boolean> {
  const dir = directory?.replace(/^\/+|\/+$/g, "");
  const text = await fetchRepoFile(repo, dir ? `${dir}/package.json` : "package.json", opts);
  if (text === null) return false;
  let doc: { name?: unknown; private?: unknown };
  try {
    doc = JSON.parse(text);
  } catch {
    return false;
  }
  if (doc.name === name) return true;
  return !dir && doc.private === true;
}
