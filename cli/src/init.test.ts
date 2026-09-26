import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_ENTRY, mergeHooks, runInit, runMcpInit } from "./init";

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

  it("leaves an unparseable settings file alone", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-init-"));
    const file = path.join(dir, "settings.json");
    writeFileSync(file, "{ not json");
    expect(runInit(file)).toBe("invalid");
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });
});

describe("runMcpInit", () => {
  const other = { type: "stdio", command: "npx", args: ["-y", "@example/server"], env: { K: "v" } };

  it("adds end-credits next to an existing server and never overwrites it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-mcp-"));
    const file = path.join(dir, ".mcp.json");
    writeFileSync(file, JSON.stringify({ mcpServers: { example: other } }));
    expect(runMcpInit(file)).toBe("added");
    expect(runMcpInit(file)).toBe("unchanged");
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.mcpServers).toEqual({ example: other, "end-credits": MCP_ENTRY });
  });

  it("keeps a user's own end-credits entry as it is", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-mcp-"));
    const file = path.join(dir, ".mcp.json");
    const mine = JSON.stringify({ mcpServers: { "end-credits": { command: "/opt/bin/endcredits", args: ["mcp"] } } });
    writeFileSync(file, mine);
    expect(runMcpInit(file)).toBe("unchanged");
    expect(readFileSync(file, "utf8")).toBe(mine);
  });

  it("creates the file when missing and leaves an unparseable one alone", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ec-mcp-"));
    const file = path.join(dir, ".mcp.json");
    expect(runMcpInit(file)).toBe("added");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ mcpServers: { "end-credits": MCP_ENTRY } });
    writeFileSync(file, "{ nope");
    expect(runMcpInit(file)).toBe("invalid");
    expect(readFileSync(file, "utf8")).toBe("{ nope");
  });
});
