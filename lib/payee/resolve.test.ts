import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { memoryStore } from "./__fixtures__/memory-store";
import { packageKey } from "./keys";
import { resolvePayee, type PackageRef } from "./resolve";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

const CLAIM = "0x1111111111111111111111111111111111111111";
const DRIPS = "0xD5371B61b35E13F2ae354BE95081aD63FB383452"; // tanstack-query.FUNDING.json
const TEA = "0xF233A42130Bcdd8b22FFB5D9593199f31C3Eeb87"; // zod.tea.yaml
const NPM = "0x3A39F5E9BFe0a90e394982492e166C5635893141";

const RAW = "https://raw.githubusercontent.com/demo/repo/HEAD";

function fakeFetch(files: Record<string, string | number>, seen: RequestInit[] = []) {
  return (async (url: string, init?: RequestInit) => {
    seen.push(init ?? {});
    const body = files[url];
    if (body === undefined) return new Response("Not Found", { status: 404 });
    if (typeof body === "number") return new Response("err", { status: body });
    return new Response(body);
  }) as typeof fetch;
}

const pkg: PackageRef = {
  id: "pkg-1",
  name: "demo",
  repoFullName: "demo/repo",
  repoDirectory: null,
  funding: [{ url: `ethereum:${NPM}` }],
};

const ownPackageJson = { [`${RAW}/package.json`]: JSON.stringify({ name: "demo" }) };

const allFiles = {
  ...ownPackageJson,
  [`${RAW}/FUNDING.json`]: fixture("tanstack-query.FUNDING.json"),
  [`${RAW}/tea.yaml`]: fixture("zod.tea.yaml"),
};

function deps(files: Record<string, string | number>, claim: string | null = null) {
  const store = memoryStore();
  const claimed: string[] = [];
  return {
    store,
    claimed,
    d: {
      store,
      fetch: fakeFetch({ ...ownPackageJson, ...files }),
      claimOf: async (key: `0x${string}`) => {
        claimed.push(key);
        return claim as `0x${string}` | null;
      },
    },
  };
}

describe("resolvePayee order", () => {
  it("claim wins over every file", async () => {
    const { d, store, claimed } = deps(allFiles, CLAIM);
    const r = await resolvePayee(pkg, d);
    expect(r).toMatchObject({ address: CLAIM, source: "claim" });
    expect(claimed).toEqual([packageKey("demo")]);
    expect(store.rows).toMatchObject([{ packageId: "pkg-1", address: CLAIM, source: "claim" }]);
  });

  it("drips wins over tea and npm funding", async () => {
    const { d, store } = deps(allFiles);
    const r = await resolvePayee(pkg, d);
    expect(r).toEqual({ address: DRIPS, source: "drips", sourceUrl: `${RAW}/FUNDING.json` });
    expect(store.rows).toMatchObject([{ address: DRIPS, source: "drips" }]);
  });

  it("tea wins over npm funding", async () => {
    const { d } = deps({ [`${RAW}/tea.yaml`]: fixture("zod.tea.yaml") });
    expect(await resolvePayee(pkg, d)).toMatchObject({ address: TEA, source: "tea" });
  });

  it("npm funding last", async () => {
    const { d } = deps({});
    expect(await resolvePayee(pkg, d)).toMatchObject({
      address: NPM,
      source: "npm_funding",
      sourceUrl: "https://registry.npmjs.org/demo",
    });
  });

  it("none records nothing", async () => {
    const { d, store } = deps({});
    expect(await resolvePayee({ ...pkg, funding: undefined }, d)).toEqual({ address: null });
    expect(store.rows).toEqual([]);
  });

  it("tea quorum above 1 falls through", async () => {
    const yaml = fixture("zod.tea.yaml").replace("quorum: 1", "quorum: 2");
    const { d } = deps({ [`${RAW}/tea.yaml`]: yaml });
    expect(await resolvePayee({ ...pkg, funding: undefined }, d)).toEqual({ address: null });
  });

  it("no repo skips the files", async () => {
    const { d } = deps(allFiles);
    const r = await resolvePayee({ ...pkg, repoFullName: null }, d);
    expect(r).toMatchObject({ source: "npm_funding" });
  });
});

describe("resolvePayee invalid addresses", () => {
  const badFunding = JSON.stringify({ drips: { ethereum: { ownedBy: "0x1234" } } });

  it("an invalid drips address falls through to tea", async () => {
    const { d } = deps({
      [`${RAW}/FUNDING.json`]: badFunding,
      [`${RAW}/tea.yaml`]: fixture("zod.tea.yaml"),
    });
    expect(await resolvePayee(pkg, d)).toMatchObject({ address: TEA, source: "tea" });
  });

  it("an invalid address with nothing after it is none with PAYEE_INVALID", async () => {
    const { d, store } = deps({ [`${RAW}/FUNDING.json`]: badFunding });
    expect(await resolvePayee({ ...pkg, funding: undefined }, d)).toEqual({
      address: null,
      reason: "PAYEE_INVALID",
    });
    expect(store.rows).toEqual([]);
  });
});

describe("resolvePayee GitHub fetch", () => {
  it("sends GITHUB_TOKEN_READ as a bearer when set", async () => {
    const seen: RequestInit[] = [];
    const store = memoryStore();
    await resolvePayee(pkg, {
      store,
      claimOf: async () => null,
      fetch: fakeFetch(allFiles, seen),
      githubToken: "t0k",
    });
    expect(new Headers(seen[0].headers).get("authorization")).toBe("Bearer t0k");
  });

  it("sends no auth header without a token", async () => {
    const seen: RequestInit[] = [];
    await resolvePayee(pkg, {
      store: memoryStore(),
      claimOf: async () => null,
      fetch: fakeFetch(allFiles, seen),
    });
    expect(new Headers(seen[0].headers).get("authorization")).toBeNull();
  });

  it("a GitHub error other than 404 throws instead of reading as none", async () => {
    const { d } = deps({ [`${RAW}/FUNDING.json`]: 502 });
    await expect(resolvePayee(pkg, d)).rejects.toThrow("502");
  });
});

describe("resolvePayee anti-spoof (T2.5)", () => {
  const prettierRaw = "https://raw.githubusercontent.com/prettier/prettier/HEAD";
  const spoof: PackageRef = {
    id: "pkg-spoof",
    name: "prettier-plus",
    repoFullName: "prettier/prettier",
    repoDirectory: null,
    funding: [{ url: `ethereum:${NPM}` }],
  };
  const prettierFiles = {
    [`${prettierRaw}/package.json`]: fixture("prettier.package.json"),
    [`${prettierRaw}/FUNDING.json`]: fixture("prettier.FUNDING.json"),
  };

  it("a repo whose package.json names another package is reserved with SPOOF_REPO", async () => {
    const { d, store } = deps(prettierFiles);
    expect(await resolvePayee(spoof, d)).toEqual({
      address: null,
      reason: "SPOOF_REPO",
      vars: { repo: "prettier/prettier", package: "prettier-plus" },
    });
    expect(store.rows).toEqual([]);
  });

  it("the real package passes", async () => {
    const { d } = deps(prettierFiles);
    expect(await resolvePayee({ ...spoof, name: "prettier" }, d)).toMatchObject({
      address: "0x3A39F5E9BFe0a90e394982492e166C5635893141",
      source: "drips",
    });
  });

  it("reads package.json under repository.directory", async () => {
    const { d } = deps({
      [`${RAW}/packages/demo/package.json`]: JSON.stringify({ name: "demo" }),
      [`${RAW}/package.json`]: JSON.stringify({ name: "other" }),
      [`${RAW}/FUNDING.json`]: fixture("tanstack-query.FUNDING.json"),
    });
    expect(await resolvePayee({ ...pkg, repoDirectory: "packages/demo" }, d)).toMatchObject({
      source: "drips",
    });
  });

  it("no package.json at the declared place is SPOOF_REPO", async () => {
    const { d } = deps({ [`${RAW}/FUNDING.json`]: fixture("tanstack-query.FUNDING.json") });
    expect(await resolvePayee({ ...pkg, repoDirectory: "packages/gone" }, d)).toMatchObject({
      reason: "SPOOF_REPO",
    });
  });

  it("a private workspace root cannot be checked and passes (colinhacks/zod)", async () => {
    const { d } = deps({
      [`${RAW}/package.json`]: fixture("zod-root.package.json"),
      [`${RAW}/tea.yaml`]: fixture("zod.tea.yaml"),
    });
    expect(await resolvePayee({ ...pkg, name: "zod" }, d)).toMatchObject({ source: "tea" });
  });

  it("a claim is not subject to the repo check", async () => {
    const { d } = deps(prettierFiles, CLAIM);
    expect(await resolvePayee(spoof, d)).toMatchObject({ source: "claim" });
  });
});
