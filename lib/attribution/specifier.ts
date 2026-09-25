// Specifier, path and install-command parsing (DESIGN §5). Shared by the CLI hook and the scorer.
import { builtinModules } from "node:module";

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const MAX_NAME = 214;
const SKIP_PREFIXES = [".", "/", "node:", "@/", "~/", "#"];
const BUILTINS = new Set(builtinModules);

export function isValidPackageName(name: string): boolean {
  return name.length <= MAX_NAME && NPM_NAME.test(name);
}

function firstSegments(parts: string[]): string | null {
  if (!parts[0]) return null;
  if (parts[0].startsWith("@")) return parts[1] ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

// Relative, absolute, `node:`, path aliases, subpath imports and Node builtins.
export function isSkippedSpecifier(spec: string): boolean {
  if (SKIP_PREFIXES.some((p) => spec.startsWith(p))) return true;
  return BUILTINS.has(spec) || BUILTINS.has(spec.split("/")[0]);
}

export function specifierToPackage(spec: string): string | null {
  if (isSkippedSpecifier(spec)) return null;
  const name = firstSegments(spec.split("/"));
  if (!name) return null;
  return isValidPackageName(name) ? name : null;
}

export interface PathPackage {
  name: string;
  inner: string; // the path inside the package, starting with its name
}

const NM = "node_modules/";

export function pathToPackage(filePath: string): PathPackage | null {
  const at = filePath.lastIndexOf(NM);
  if (at < 0 || (at > 0 && filePath[at - 1] !== "/")) return null;
  const inner = filePath.slice(at + NM.length).replace(/\/+$/, "");
  if (inner.startsWith(".")) return null;
  const name = firstSegments(inner.split("/"));
  if (!name || !isValidPackageName(name)) return null;
  return { name, inner };
}

// Linear-time patterns: a 1 MB Write must stay well inside the hook's 50 ms budget.
const SPEC = String.raw`(['"])([^'"\n]{1,300})\1`;
const PATTERNS = [
  new RegExp(String.raw`\bfrom\s*${SPEC}`, "g"), // import … from 'x', export … from 'x'
  new RegExp(String.raw`\bimport\s*${SPEC}`, "g"), // import 'x'
  new RegExp(String.raw`\b(?:require|import)\s*\(\s*${SPEC}\s*\)`, "g"), // require('x'), import('x')
];

export function extractSpecifiers(code: string): string[] {
  const found = new Set<string>();
  for (const re of PATTERNS) {
    for (const m of code.matchAll(re)) found.add(m[2]);
  }
  return [...found];
}

const INSTALL =
  /(?:^|[\s;&|(])(?:npm\s+(?:i|install|add)|pnpm\s+add|yarn\s+add|bun\s+add)(?=\s|$)([^;&|\n]*)/g;

function nameFromInstallArg(arg: string): string | null {
  const bare = arg.replace(/^['"]|['"]$/g, "");
  const versionAt = bare.indexOf("@", bare.startsWith("@") ? 1 : 0);
  const name = versionAt > 0 ? bare.slice(0, versionAt) : bare;
  return isValidPackageName(name) ? name : null;
}

export function packagesFromInstall(command: string): string[] {
  const names = new Set<string>();
  for (const m of command.matchAll(INSTALL)) {
    for (const arg of m[1].trim().split(/\s+/)) {
      if (!arg || arg.startsWith("-")) continue;
      const name = nameFromInstallArg(arg);
      if (name) names.add(name);
    }
  }
  return [...names];
}
