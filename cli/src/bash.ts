// node_modules paths read by a Bash command. On macOS and Linux, Glob and Grep reach the hook as
// Bash calls (decisions.md "CONFIRM: Claude Code hooks"), so reads hide in `cat`, `grep`, `find`…
import { pathToPackage } from "../../lib/attribution/specifier";

const READERS = new Set([
  "cat", "head", "tail", "less", "more", "grep", "egrep", "rg", "ag", "find", "fd", "ls", "tree",
  "sed", "awk", "wc", "bat", "file", "stat", "jq",
]);
const MAX_PATHS = 20;

const unquote = (token: string) => token.replace(/^['"]+|['"]+$/g, "");

function commandName(words: string[]): string | undefined {
  const first = words.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)); // skip FOO=1 prefixes
  return first?.split("/").pop();
}

export function readPathsFromBash(command: string): string[] {
  if (!command.includes("node_modules/")) return [];
  const paths: string[] = [];
  for (const segment of command.split(/\|\|?|&&|;|\n/)) {
    const words = segment.trim().split(/\s+/).map(unquote).filter(Boolean);
    const name = commandName(words);
    if (!name || !READERS.has(name)) continue;
    for (const word of words) {
      if (word.includes("node_modules/") && pathToPackage(word) && !paths.includes(word)) {
        paths.push(word);
        if (paths.length === MAX_PATHS) return paths;
      }
    }
  }
  return paths;
}
