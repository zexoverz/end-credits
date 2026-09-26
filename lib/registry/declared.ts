// Repository and homepage a package declares in its installed package.json, for packages the npm
// registry does not know (installed from git or a private registry). Shared by the CLI (what it
// sends) and the upload schema (what it accepts), so the CLI never sends a body the server rejects.
import { parseRepository, type RepoRef } from "./npm";

export const MAX_URL_CHARS = 512;
export const MAX_DIRECTORY_CHARS = 200;

const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const REPO = /^[\w.-]{1,100}$/;
const SEGMENT = /^[\w@.-]+$/;

export type DeclaredRepository = string | { url: string; directory?: string };

function validDirectory(dir: string): boolean {
  if (dir.length > MAX_DIRECTORY_CHARS) return false;
  const parts = dir.replace(/\/+$/, "").split("/");
  return parts.every((p) => SEGMENT.test(p) && p !== "." && p !== "..");
}

/** The GitHub repo a declared `repository` names, or null for anything else (local paths included). */
export function declaredRepository(repo: unknown): RepoRef | null {
  const url = typeof repo === "string" ? repo : (repo as { url?: unknown } | null)?.url;
  if (typeof url !== "string" || url.length > MAX_URL_CHARS) return null;
  const ref = parseRepository(repo);
  if (!ref) return null;
  const [owner, name] = ref.fullName.split("/");
  if (!OWNER.test(owner) || !REPO.test(name) || name === "." || name === "..") return null;
  if (ref.directory !== null && !validDirectory(ref.directory)) return null;
  return ref;
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL_CHARS) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** The repository and homepage the CLI uploads for one installed package.json. */
export function declaredMeta(pkg: { repository?: unknown; homepage?: unknown }): {
  repository?: DeclaredRepository;
  homepage?: string;
} {
  const out: { repository?: DeclaredRepository; homepage?: string } = {};
  const ref = declaredRepository(pkg.repository);
  if (ref) {
    const repo = pkg.repository;
    out.repository =
      typeof repo === "string"
        ? repo
        : { url: (repo as { url: string }).url, ...(ref.directory ? { directory: ref.directory } : {}) };
  }
  if (isHttpsUrl(pkg.homepage)) out.homepage = pkg.homepage;
  return out;
}
