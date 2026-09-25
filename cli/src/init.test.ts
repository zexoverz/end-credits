import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeHooks, runInit } from "./init";

const prior = {
  model: "opus",
  hooks: {
    PostToolUse: [
      { matcher: "Write|Edit", hooks: [{ type: "command", command: "prettier --write" }] },
    ],
    SessionEnd: [{ hooks: [{ type: "command", command: "say done" }] }],
  },
};

function commands(settings: ReturnType<typeof mergeHooks>, event: string): string[] {
  return (settings.hooks[event] ?? []).flatMap((g) => g.hooks.map((h) => h.command));
}

describe("mergeHooks", () => {
  it("keeps existing hooks and other settings", () => {
    const merged = mergeHooks(structuredClone(prior));
    expect(merged.model).toBe("opus");
    expect(commands(merged, "PostToolUse")).toEqual(["prettier --write", "endcredits record"]);
    expect(commands(merged, "SessionEnd")).toEqual(["say done", "endcredits settle"]);
    expect(commands(merged, "SessionStart")).toEqual(["endcredits start"]);
  });

  it("does not mutate its input", () => {
    const input = structuredClone(prior);
    mergeHooks(input);
    expect(input).toEqual(prior);
  });

  it("is idempotent", () => {
    const once = mergeHooks(structuredClone(prior));
    const twice = mergeHooks(once);
    expect(twice).toEqual(once);
    expect(commands(twice, "PostToolUse").filter((c) => c === "endcredits record")).toHaveLength(1);
  });

  it("sets the record matcher and the SessionEnd timeout", () => {
    const merged = mergeHooks({});
    const record = merged.hooks.PostToolUse.find((g) => g.hooks[0].command === "endcredits record");
    expect(record?.matcher).toBe("Read|Grep|Glob|Write|Edit|MultiEdit|WebFetch|Bash");
    expect(merged.hooks.SessionEnd[0].hooks[0].timeout).toBe(15);
  });
});

describe("runInit", () => {
  it("writes into an existing settings file without losing hooks", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-init-"));
    const file = path.join(dir, ".claude", "settings.json");
    mkdirSync(path.dirname(file));
    writeFileSync(file, JSON.stringify(prior));
    expect(runInit(file)).toBe("added");
    expect(runInit(file)).toBe("unchanged");
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(commands(saved, "PostToolUse")).toEqual(["prettier --write", "endcredits record"]);
  });

  it("creates the file and folder when missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-init-"));
    const file = path.join(dir, ".claude", "settings.json");
    expect(runInit(file)).toBe("added");
    expect(commands(JSON.parse(readFileSync(file, "utf8")), "SessionStart")).toEqual([
      "endcredits start",
    ]);
  });

  it("leaves an unparseable file alone", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-init-"));
    const file = path.join(dir, "settings.json");
    writeFileSync(file, "{ not json");
    expect(runInit(file)).toBe("invalid");
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });
});
