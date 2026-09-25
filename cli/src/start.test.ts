import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readDeps, runStart } from "./start";

const SID = "3f1c2d4e-0000-4000-8000-000000000002";
const tmp = (p: string) => mkdtempSync(path.join(tmpdir(), p));

afterEach(() => vi.restoreAllMocks());

describe("readDeps", () => {
  it("unions dependencies and devDependencies", () => {
    const cwd = tmp("ec-cwd-");
    writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({ dependencies: { zod: "^3" }, devDependencies: { vitest: "^3" } }),
    );
    expect(readDeps(cwd)).toEqual({ zod: "^3", vitest: "^3" });
  });

  it("is empty without a package.json", () => {
    expect(readDeps(tmp("ec-cwd-"))).toEqual({});
  });
});

describe("runStart", () => {
  it("snapshots deps for the session and prints nothing", () => {
    const home = tmp("ec-home-");
    const cwd = tmp("ec-cwd-");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { viem: "2" } }));
    const out = vi.spyOn(process.stdout, "write");
    runStart(JSON.stringify({ session_id: SID, cwd, hook_event_name: "SessionStart" }), home);
    expect(out).not.toHaveBeenCalled();
    const snap = JSON.parse(readFileSync(path.join(home, "sessions", `${SID}.start.json`), "utf8"));
    expect(snap.cwd).toBe(cwd);
    expect(snap.deps).toEqual({ viem: "2" });
    expect(Date.parse(snap.startedAt)).not.toBeNaN();
  });

  it("keeps the first snapshot when the session resumes", () => {
    const home = tmp("ec-home-");
    const cwd = tmp("ec-cwd-");
    writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { a: "1" } }));
    runStart(JSON.stringify({ session_id: SID, cwd }), home);
    writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { a: "1", b: "1" } }));
    runStart(JSON.stringify({ session_id: SID, cwd, source: "resume" }), home);
    const snap = JSON.parse(readFileSync(path.join(home, "sessions", `${SID}.start.json`), "utf8"));
    expect(snap.deps).toEqual({ a: "1" });
  });

  it("malformed stdin does not throw and logs", () => {
    const home = tmp("ec-home-");
    expect(() => runStart("nope", home)).not.toThrow();
    expect(existsSync(path.join(home, "errors.log"))).toBe(true);
  });
});
