import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_API_URL, readConfig, writeConfig } from "./config";
import { ecHome } from "./paths";

const home = () => mkdtempSync(path.join(tmpdir(), "ec-home-"));

describe("ecHome", () => {
  it("honours ENDCREDITS_HOME", () => {
    expect(ecHome({ ENDCREDITS_HOME: "/x/y" })).toBe("/x/y");
  });
  it("defaults to ~/.endcredits", () => {
    expect(ecHome({})).toMatch(/\.endcredits$/);
  });
});

describe("writeConfig", () => {
  it("writes apiUrl and agentKey with mode 600", () => {
    const dir = home();
    const file = writeConfig(dir, "ec_abc123", undefined);
    expect(file).toBe(path.join(dir, "config.json"));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      apiUrl: DEFAULT_API_URL,
      agentKey: "ec_abc123",
    });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("tightens an existing file to 600", () => {
    const dir = home();
    writeFileSync(path.join(dir, "config.json"), "{}", { mode: 0o644 });
    writeConfig(dir, "ec_abc123", "http://localhost:3000/");
    const file = path.join(dir, "config.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readConfig(dir)).toEqual({ apiUrl: "http://localhost:3000", agentKey: "ec_abc123" });
  });

  it("rejects an empty token and a non-http api url", () => {
    expect(() => writeConfig(home(), "", undefined)).toThrow();
    expect(() => writeConfig(home(), "ec_x", "ftp://x")).toThrow();
  });
});

describe("readConfig", () => {
  it("returns null when missing or broken", () => {
    const dir = home();
    expect(readConfig(dir)).toBeNull();
    writeFileSync(path.join(dir, "config.json"), "nope");
    expect(readConfig(dir)).toBeNull();
  });
});
