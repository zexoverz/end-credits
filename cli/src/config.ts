// `endcredits key <token> [--api <url>]`: `~/.endcredits/config.json`, mode 600 (DESIGN §4.1).
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configPath } from "./paths";

export const DEFAULT_API_URL = "https://end-credits.up.railway.app";

export interface Config {
  apiUrl: string;
  agentKey: string;
}

function normaliseApiUrl(raw: string | undefined): string {
  const url = new URL(raw ?? DEFAULT_API_URL);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("api url must be http(s)");
  }
  return url.origin;
}

export function writeConfig(home: string, token: string, api: string | undefined): string {
  const agentKey = token.trim();
  if (!agentKey || /\s/.test(agentKey)) throw new Error("agent key is empty or has spaces");
  const config: Config = { apiUrl: normaliseApiUrl(api), agentKey };
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const file = configPath(home);
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

export function readConfig(home: string): Config | null {
  try {
    const parsed = JSON.parse(readFileSync(configPath(home), "utf8")) as Partial<Config>;
    if (typeof parsed.apiUrl !== "string" || typeof parsed.agentKey !== "string") return null;
    return { apiUrl: parsed.apiUrl, agentKey: parsed.agentKey };
  } catch {
    return null;
  }
}
