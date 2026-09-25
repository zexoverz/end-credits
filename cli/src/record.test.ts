import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lineFor, runRecord } from "./record";

const SID = "3f1c2d4e-0000-4000-8000-000000000001";
const home = () => mkdtempSync(path.join(tmpdir(), "ec-rec-"));
const hook = (tool_name: string, tool_input: unknown) =>
  JSON.stringify({ session_id: SID, cwd: "/repo", hook_event_name: "PostToolUse", tool_name, tool_input });
const ledger = (dir: string) => {
  const file = path.join(dir, "sessions", `${SID}.jsonl`);
  return existsSync(file)
    ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

afterEach(() => vi.restoreAllMocks());

describe("lineFor", () => {
  it("Read under node_modules → read line", () => {
    expect(lineFor("Read", { file_path: "/repo/node_modules/zod/lib/types.d.ts" })).toEqual({
      t: "read",
      p: "/repo/node_modules/zod/lib/types.d.ts",
    });
  });

  it("Read elsewhere → nothing", () => {
    expect(lineFor("Read", { file_path: "/repo/src/index.ts" })).toBeNull();
  });

  it("Grep and Glob use path, then pattern", () => {
    expect(lineFor("Grep", { pattern: "ZodType", path: "/repo/node_modules/zod" })).toEqual({
      t: "read",
      p: "/repo/node_modules/zod",
    });
    expect(lineFor("Glob", { pattern: "node_modules/viem/**/*.d.ts" })).toEqual({
      t: "read",
      p: "node_modules/viem/**/*.d.ts",
    });
    expect(lineFor("Grep", { pattern: "foo", path: "/repo/src" })).toBeNull();
  });

  it("Write → code line with hashed path and specifiers", () => {
    expect(
      lineFor("Write", { file_path: "/repo/src/a.ts", content: `import { z } from "zod";` }),
    ).toEqual({ t: "code", f: sha("/repo/src/a.ts"), specs: ["zod"] });
  });

  it("Write without imports → nothing", () => {
    expect(lineFor("Write", { file_path: "/repo/a.md", content: "# hi" })).toBeNull();
  });

  it("Edit uses new_string", () => {
    expect(
      lineFor("Edit", { file_path: "/repo/a.ts", old_string: "x", new_string: `require('yaml')` }),
    ).toEqual({ t: "code", f: sha("/repo/a.ts"), specs: ["yaml"] });
  });

  it("MultiEdit uses every edit", () => {
    const line = lineFor("MultiEdit", {
      file_path: "/repo/a.ts",
      edits: [{ new_string: `import "viem"` }, { new_string: `import("postgres")` }],
    });
    expect(line).toEqual({ t: "code", f: sha("/repo/a.ts"), specs: ["viem", "postgres"] });
  });

  it("WebFetch → docs line", () => {
    expect(lineFor("WebFetch", { url: "https://zod.dev/api", prompt: "x" })).toEqual({
      t: "docs",
      u: "https://zod.dev/api",
    });
  });

  it("Bash install → add line", () => {
    expect(lineFor("Bash", { command: "pnpm add zod@^3 -D" })).toEqual({ t: "add", pkgs: ["zod"] });
  });

  it("Bash read of node_modules → read line with paths", () => {
    expect(
      lineFor("Bash", {
        command: `cat node_modules/zod/package.json | head -5 && grep -rn "x" "/repo/node_modules/@x402/core/dist"`,
      }),
    ).toEqual({
      t: "read",
      ps: ["node_modules/zod/package.json", "/repo/node_modules/@x402/core/dist"],
    });
    expect(lineFor("Bash", { command: "find node_modules/viem -name '*.d.ts'" })).toEqual({
      t: "read",
      ps: ["node_modules/viem"],
    });
  });

  it("Bash that is not a reader → nothing", () => {
    expect(lineFor("Bash", { command: "rm -rf node_modules/zod" })).toBeNull();
    expect(lineFor("Bash", { command: "ls node_modules" })).toBeNull();
    expect(lineFor("Bash", { command: "pnpm test" })).toBeNull();
  });

  it("unknown tools and bad input → nothing", () => {
    expect(lineFor("TodoWrite", { todos: [] })).toBeNull();
    expect(lineFor("Read", null)).toBeNull();
    expect(lineFor("Write", { file_path: 3, content: {} })).toBeNull();
  });
});

describe("runRecord", () => {
  it("appends one line per call to the session ledger", () => {
    const dir = home();
    runRecord(hook("Read", { file_path: "/repo/node_modules/zod/index.d.ts" }), dir);
    runRecord(hook("WebFetch", { url: "https://zod.dev" }), dir);
    expect(ledger(dir)).toEqual([
      { t: "read", p: "/repo/node_modules/zod/index.d.ts" },
      { t: "docs", u: "https://zod.dev" },
    ]);
  });

  it("malformed stdin: no throw, nothing on stdout, error logged", () => {
    const dir = home();
    const out = vi.spyOn(process.stdout, "write");
    expect(() => runRecord("{ not json", dir)).not.toThrow();
    expect(() => runRecord("", dir)).not.toThrow();
    expect(() => runRecord(JSON.stringify({ session_id: "../../etc", tool_name: "Read" }), dir)).not.toThrow();
    expect(out).not.toHaveBeenCalled();
    expect(readFileSync(path.join(dir, "errors.log"), "utf8")).toMatch(/record/);
    expect(existsSync(path.join(dir, "sessions"))).toBe(false);
  });

  it("an unwritable home does not throw", () => {
    expect(() =>
      runRecord(hook("WebFetch", { url: "https://zod.dev" }), "/dev/null/nope"),
    ).not.toThrow();
  });

  it("handles a 1 MB Write in under 50 ms without stdout", () => {
    const dir = home();
    const body = `import { z } from "zod";\n` + "const x = 1; // filler line\n".repeat(38_000);
    expect(body.length).toBeGreaterThan(1_000_000);
    const raw = hook("Write", { file_path: "/repo/src/big.ts", content: body });
    runRecord(hook("WebFetch", { url: "https://warm.up" }), dir);
    const out = vi.spyOn(process.stdout, "write");
    const t0 = performance.now();
    runRecord(raw, dir);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
    expect(out).not.toHaveBeenCalled();
    expect(ledger(dir).at(-1)).toMatchObject({ t: "code", specs: ["zod"] });
  });
});
