// Docs URL → installed package (DESIGN §5). Registry metadata is passed in; no network here.

export interface PackageMeta {
  version?: string;
  homepage?: string;
  repository?: string | { url?: string };
}

export interface DocsMatch {
  name: string;
  ambiguous: boolean;
}

// Hosts that serve many packages: a homepage there says nothing about which package a URL is for.
const SHARED_HOSTS = new Set([
  "github.com", "www.github.com", "gitlab.com", "bitbucket.org", "npmjs.com", "www.npmjs.com",
  "unpkg.com", "cdn.jsdelivr.net",
]);

const GITHUB_REPO = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function githubPath(url: URL): string | null {
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  return `${owner}/${repo.replace(/\.git$/, "")}`.toLowerCase();
}

export function repoUrl(repository: PackageMeta["repository"]): string | null {
  const raw = (typeof repository === "string" ? repository : repository?.url)?.trim();
  if (!raw) return null;
  const shorthand = raw.replace(/^github:/, "").replace(/^git@github\.com:/, "");
  const direct = GITHUB_REPO.exec(shorthand);
  if (direct && !raw.includes("://")) return `https://github.com/${direct[1]}/${direct[2]}`;
  const url = parseUrl(raw.replace(/^git\+/, "").replace(/^git:\/\//, "https://"));
  const path = url && githubPath(url);
  return path ? `https://github.com/${path}` : null;
}

function repoOf(meta: PackageMeta): string | null {
  const fromRepo = repoUrl(meta.repository);
  if (fromRepo) return fromRepo.slice("https://github.com/".length).toLowerCase();
  const home = meta.homepage ? parseUrl(meta.homepage) : null;
  return home ? githubPath(home) : null;
}

function registryPath(name: string, url: URL): boolean {
  const path = decodeURIComponent(url.pathname);
  const at = (prefix: string) =>
    path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}@`);
  switch (url.hostname) {
    case "npmjs.com":
    case "www.npmjs.com":
      return path === `/package/${name}` || path.startsWith(`/package/${name}/`);
    case "unpkg.com":
      return at(`/${name}`);
    case "cdn.jsdelivr.net":
      return at(`/npm/${name}`);
    default:
      return false;
  }
}

function matches(name: string, meta: PackageMeta, url: URL): boolean {
  if (registryPath(name, url)) return true;
  const repo = repoOf(meta);
  if (repo && githubPath(url) === repo) return true;
  const home = meta.homepage ? parseUrl(meta.homepage) : null;
  return !!home && !SHARED_HOSTS.has(home.hostname) && home.hostname === url.hostname;
}

function pathMentions(url: URL, name: string): boolean {
  const path = decodeURIComponent(url.pathname).toLowerCase();
  const bare = name.includes("/") ? name.split("/")[1] : name;
  return path.includes(name) || path.includes(bare);
}

export function docsPackage(raw: string, installed: Record<string, PackageMeta>): DocsMatch | null {
  const url = parseUrl(raw);
  if (!url) return null;
  const hits = Object.keys(installed)
    .sort()
    .filter((name) => matches(name, installed[name], url));
  if (hits.length === 0) return null;
  if (hits.length === 1) return { name: hits[0], ambiguous: false };
  return { name: hits.find((n) => pathMentions(url, n)) ?? hits[0], ambiguous: true };
}
