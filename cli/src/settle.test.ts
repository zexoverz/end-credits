import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { writeConfig } from "./config";
import { makeFixture } from "./fixture";
import { runSettleHook, settleSession, type SettleDeps } from "./settle";

const API = "http://localhost:3999";

function deps(fetchImpl: SettleDeps["fetch"]) {
  const said: string[] = [];
  const opened: string[] = [];
  const d: SettleDeps = {
    fetch: fetchImpl,
    open: (u) => opened.push(u),
    say: (l) => said.push(l),
    now: () => new Date("2026-09-26T02:00:00Z"),
  };
  return { d, said, opened };
}

function setup() {
  const fx = makeFixture([{ t: "code", f: "h1", specs: ["zod"] }]);
  writeConfig(fx.home, "ec_secret_token", API);
  const ledger = path.join(fx.home, "sessions", `${fx.sid}.jsonl`);
  return { fx, ledger };
}

describe("settleSession", () => {
  it("keeps the ledger when the upload fails", async () => {
    const { fx, ledger } = setup();
    const { d, said, opened } = deps(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const res = await settleSession(fx.home, fx.sid, d);
    expect(res.ok).toBe(false);
    expect(existsSync(ledger)).toBe(true);
    expect(existsSync(path.join(fx.home, "sessions", `${fx.sid}.start.json`))).toBe(true);
    expect(opened).toEqual([]);
    expect(said[0]).toBe(
      `End Credits: upload failed (connect ECONNREFUSED). The ledger is kept; retry with: endcredits settle --session ${fx.sid}`,
    );
  });

  it("keeps the ledger on a non-2xx response", async () => {
    const { fx, ledger } = setup();
    const { d } = deps(async () => new Response("nope", { status: 401 }));
    const res = await settleSession(fx.home, fx.sid, d);
    expect(res).toEqual({ ok: false, error: "HTTP 401" });
    expect(existsSync(ledger)).toBe(true);
  });

  it("uploads with the bearer key and a 5 s timeout, then opens the roll", async () => {
    const { fx, ledger } = setup();
    const fetchSpy = vi.fn<SettleDeps["fetch"]>(async () =>
      Response.json({ id: "abc", url: `${API}/credits/abc` }, { status: 201 }),
    );
    const { d, said, opened } = deps(fetchSpy);
    const res = await settleSession(fx.home, fx.sid, d);
    expect(res).toEqual({ ok: true, id: "abc", url: `${API}/credits/abc` });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API}/api/sessions`);
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer ec_secret_token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body)).packages[0].name).toBe("zod");
    expect(said).toEqual([`End Credits: rolling credits at ${API}/credits/abc`]);
    expect(opened).toEqual([`${API}/credits/abc`]);
    expect(existsSync(ledger)).toBe(false);
    expect(JSON.parse(readFileSync(path.join(fx.home, "sessions", `${fx.sid}.done.json`), "utf8")).id).toBe("abc");
  });

  it("never opens a URL on another origin", async () => {
    const { fx } = setup();
    const { d, opened } = deps(async () =>
      Response.json({ id: "abc", url: "file:///etc/passwd" }, { status: 201 }),
    );
    await settleSession(fx.home, fx.sid, d);
    expect(opened).toEqual([`${API}/credits/abc`]);
  });

  it("without a key it says so and keeps the ledger", async () => {
    const fx = makeFixture([{ t: "code", f: "h1", specs: ["zod"] }]);
    const fetchSpy = vi.fn<SettleDeps["fetch"]>();
    const { d, said } = deps(fetchSpy);
    expect((await settleSession(fx.home, fx.sid, d)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(said).toEqual(["No agent key yet. Run: endcredits key <token>"]);
    expect(existsSync(path.join(fx.home, "sessions", `${fx.sid}.jsonl`))).toBe(true);
  });

  it("with nothing used it uploads nothing", async () => {
    const fx = makeFixture([{ t: "docs", u: "https://example.com" }], { endDeps: { zod: "^3" } });
    writeConfig(fx.home, "ec_k", API);
    const fetchSpy = vi.fn<SettleDeps["fetch"]>();
    const { d, said } = deps(fetchSpy);
    await settleSession(fx.home, fx.sid, d);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(said).toEqual([`No installed packages were used in session ${fx.sid}.`]);
  });
});

describe("runSettleHook", () => {
  it("records the end and hands the upload to a detached child", () => {
    const { fx } = setup();
    const spawned: [string, string][] = [];
    runSettleHook(
      JSON.stringify({ session_id: fx.sid, cwd: fx.cwd, hook_event_name: "SessionEnd", reason: "exit" }),
      fx.home,
      (id, cwd) => spawned.push([id, cwd]),
      () => new Date("2026-09-26T03:00:00Z"),
    );
    expect(spawned).toEqual([[fx.sid, fx.cwd]]);
    const end = JSON.parse(readFileSync(path.join(fx.home, "sessions", `${fx.sid}.end.json`), "utf8"));
    expect(end).toEqual({ endedAt: "2026-09-26T03:00:00.000Z", cwd: fx.cwd });
  });

  it("malformed stdin never throws and spawns nothing", () => {
    const { fx } = setup();
    const spawn = vi.fn();
    expect(() => runSettleHook("nope", fx.home, spawn, () => new Date())).not.toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });
});
