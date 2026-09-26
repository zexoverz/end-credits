import { describe, expect, it } from "vitest";
import { declaredMeta, declaredRepository, isHttpsUrl } from "./declared";

describe("declaredRepository", () => {
  it.each([
    ["github:zexoverz/endcredits-fixture-moved-payout", "zexoverz/endcredits-fixture-moved-payout", null],
    ["git+https://github.com/colinhacks/zod.git", "colinhacks/zod", null],
    [{ type: "git", url: "https://github.com/tanstack/query", directory: "packages/react-query" }, "tanstack/query", "packages/react-query"],
  ])("%j is a GitHub repo", (repo, fullName, directory) => {
    expect(declaredRepository(repo)).toEqual({ fullName, directory });
  });

  it.each([
    ["gitlab", "https://gitlab.com/a/b"],
    ["a local path", "../secret-repo"],
    ["a dot owner", "./x"],
    ["an absolute path", "file:/Users/me/x"],
    ["a too long url", `https://github.com/a/${"b".repeat(600)}`],
    ["a parent directory", { url: "https://github.com/a/b", directory: "../../etc" }],
    ["an absolute directory", { url: "https://github.com/a/b", directory: "/Users/me/pkg" }],
    ["no url", { directory: "x" }],
  ])("rejects %s", (_label, repo) => {
    expect(declaredRepository(repo)).toBeNull();
  });
});

describe("isHttpsUrl", () => {
  it("accepts https only", () => {
    expect(isHttpsUrl("https://zod.dev")).toBe(true);
    expect(isHttpsUrl("http://zod.dev")).toBe(false);
    expect(isHttpsUrl("file:///Users/me")).toBe(false);
    expect(isHttpsUrl(`https://x.dev/${"a".repeat(600)}`)).toBe(false);
    expect(isHttpsUrl(42)).toBe(false);
  });
});

describe("declaredMeta", () => {
  it("keeps a GitHub repository and an https homepage, normalised", () => {
    expect(
      declaredMeta({
        repository: { type: "git", url: "https://github.com/a/b", directory: "pkgs/x", web: "y" },
        homepage: "https://b.dev",
      }),
    ).toEqual({ repository: { url: "https://github.com/a/b", directory: "pkgs/x" }, homepage: "https://b.dev" });
  });

  it("drops anything that is not", () => {
    expect(declaredMeta({ repository: "../local", homepage: "http://b.dev" })).toEqual({});
  });
});
