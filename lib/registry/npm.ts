// npm registry reader (DESIGN §7.2). The repo regex is the one in scripts/measure-funding.py.

const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week";
const CACHE_TTL_MS = 60 * 60 * 1000;

const GITHUB_URL = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?]|$)/;
const SHORTHAND = /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;
const FUNDING_HOSTS = [/^https:\/\/github\.com\/sponsors\//, /^https:\/\/opencollective\.com\//];

export type RepoRef = { fullName: string; directory: string | null };

export type NpmPackage = {
  name: string;
  version: string | null;
  repoFullName: string | null;
  repoDirectory: string | null;
  homepage: string | null;
  funding: unknown;
  fundingLinks: string[];
  createdAt: Date | null;
};

/** Where repoFullName came from: the registry, or the package.json the uploader declared. */
export type RepoSource = "registry" | "declared";

export type NpmPackageWithDownloads = NpmPackage & { weeklyDownloads: number | null; repoSource?: RepoSource };

/** The registry has no document for this name (never published, or installed from git). */
export class RegistryNotFound extends Error {
  constructor(name: string) {
    super(`npm registry 404 for ${name}`);
    this.name = "RegistryNotFound";
  }
}

type Fetch = typeof fetch;
type Doc = Record<string, unknown>;

export function registryUrl(name: string): string {
  return `${REGISTRY}/${name.replace("/", "%2f")}`;
}

export function parseRepository(repo: unknown): RepoRef | null {
  const obj = typeof repo === "object" && repo !== null ? (repo as Doc) : null;
  const url = typeof repo === "string" ? repo : typeof obj?.url === "string" ? obj.url : null;
  if (!url) return null;
  const m = url.match(GITHUB_URL) ?? url.match(SHORTHAND);
  if (!m) return null;
  const directory = typeof obj?.directory === "string" && obj.directory ? obj.directory : null;
  return { fullName: `${m[1]}/${m[2]}`.toLowerCase(), directory };
}

export function fundingLinks(funding: unknown): string[] {
  const entries = Array.isArray(funding) ? funding : funding == null ? [] : [funding];
  return entries
    .map((e) => (typeof e === "string" ? e : typeof e?.url === "string" ? e.url : null))
    .filter((url): url is string => !!url && FUNDING_HOSTS.some((re) => re.test(url)));
}

export function parseRegistryDoc(doc: Doc, version?: string): NpmPackage {
  const tags = (doc["dist-tags"] ?? {}) as Record<string, string>;
  const versions = (doc.versions ?? {}) as Record<string, Doc>;
  const v = version && versions[version] ? version : (tags.latest ?? null);
  const meta = (v && versions[v]) || {};
  const repo = parseRepository(meta.repository ?? doc.repository);
  const created = (doc.time as Record<string, string> | undefined)?.created;
  const homepage = meta.homepage ?? doc.homepage;
  return {
    name: String(doc.name),
    version: v,
    repoFullName: repo?.fullName ?? null,
    repoDirectory: repo?.directory ?? null,
    homepage: typeof homepage === "string" ? homepage : null,
    funding: meta.funding ?? doc.funding,
    fundingLinks: fundingLinks(meta.funding ?? doc.funding),
    createdAt: created ? new Date(created) : null,
  };
}

async function weeklyDownloads(name: string, fetchFn: Fetch): Promise<number | null> {
  const res = await fetchFn(`${DOWNLOADS}/${name}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { downloads?: unknown };
  return typeof body.downloads === "number" ? body.downloads : null;
}

const cache = new Map<string, { at: number; value: NpmPackageWithDownloads }>();

export async function loadPackage(
  name: string,
  opts: { version?: string; fetch?: Fetch; now?: () => number } = {},
): Promise<NpmPackageWithDownloads> {
  const fetchFn = opts.fetch ?? fetch;
  const now = (opts.now ?? Date.now)();
  const key = `${name}@${opts.version ?? "latest"}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  const res = await fetchFn(registryUrl(name));
  if (res.status === 404) throw new RegistryNotFound(name);
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${name}`);
  const parsed = parseRegistryDoc((await res.json()) as Doc, opts.version);
  const value = { ...parsed, weeklyDownloads: await weeklyDownloads(name, fetchFn) };
  cache.set(key, { at: now, value });
  return value;
}

export function clearRegistryCache(): void {
  cache.clear();
}
