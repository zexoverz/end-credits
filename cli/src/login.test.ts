import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cliMsg } from "../../lib/messages";
import { configPath } from "./paths";
import { runLogin, type LoginDeps } from "./login";

const API = "https://credits.test";
const START = {
  id: "0b6f2f4e-6f0e-4d4a-9a53-3c1f1e2d9a10",
  user_code: "WDJB-MJHT",
  verification_uri: "https://world.org/device",
  verification_uri_complete: "https://world.org/device?code=WDJB-MJHT",
  interval: 5,
  expires_in: 600,
};

/** A fake End Credits API: start answers START, each poll answers the next of `polls`. */
function harness(polls: { status: number; body: unknown }[]) {
  const home = mkdtempSync(path.join(tmpdir(), "ec-login-"));
  const said: string[] = [];
  const sleeps: number[] = [];
  const requests: { url: string; body: unknown }[] = [];
  const deps: LoginDeps = {
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).endsWith("/start")) return Response.json(START);
      const next = polls.shift();
      if (!next) throw new Error("polled too often");
      return Response.json(next.body, { status: next.status });
    },
    say: (line) => said.push(line),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    hostname: () => "laptop",
  };
  return { home, said, sleeps, requests, deps };
}

describe("endcredits login", () => {
  it("prints the code, polls, and saves the key with mode 600", async () => {
    const h = harness([
      { status: 200, body: { status: "authorization_pending" } },
      { status: 200, body: { status: "slow_down" } },
      { status: 200, body: { status: "complete", token: "ec_newkey" } },
    ]);
    expect(await runLogin(h.home, API, h.deps)).toBe(0);
    expect(h.said[0]).toBe(cliMsg("LOGIN_CODE", { url: START.verification_uri_complete, code: "WDJB-MJHT" }));
    expect(h.sleeps).toEqual([5000, 5000, 10000]);
    expect(h.requests[1]).toEqual({
      url: `${API}/api/agent/device/poll`,
      body: { id: START.id, label: "laptop, Claude Code" },
    });
    const file = configPath(h.home);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ apiUrl: API, agentKey: "ec_newkey" });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(h.said.at(-1)).toBe(cliMsg("LOGIN_SAVED", { path: file }));
  });

  it("denied in World App: stops, no key", async () => {
    const h = harness([{ status: 403, body: { status: "access_denied" } }]);
    expect(await runLogin(h.home, API, h.deps)).toBe(1);
    expect(h.said.at(-1)).toBe(cliMsg("LOGIN_DENIED"));
    expect(existsSync(configPath(h.home))).toBe(false);
  });

  it("expired code: stops, no key", async () => {
    const h = harness([{ status: 410, body: { status: "expired_token" } }]);
    expect(await runLogin(h.home, API, h.deps)).toBe(1);
    expect(h.said.at(-1)).toBe(cliMsg("LOGIN_EXPIRED"));
    expect(existsSync(configPath(h.home))).toBe(false);
  });

  it("not an owner: stops, no key", async () => {
    const h = harness([{ status: 403, body: { status: "no_owner" } }]);
    expect(await runLogin(h.home, API, h.deps)).toBe(1);
    expect(h.said.at(-1)).toBe(cliMsg("LOGIN_NO_OWNER"));
    expect(existsSync(configPath(h.home))).toBe(false);
  });

  it("stops at expires_in even if the server keeps saying pending", async () => {
    const pending = Array.from({ length: 500 }, () => ({ status: 200, body: { status: "authorization_pending" } }));
    const h = harness(pending);
    expect(await runLogin(h.home, API, h.deps)).toBe(1);
    expect(h.said.at(-1)).toBe(cliMsg("LOGIN_EXPIRED"));
    expect(h.sleeps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(600_000);
  });
});
