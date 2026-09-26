import { describe, expect, it } from "vitest";
import {
  clearRegistryCache,
  fundingLinks,
  loadPackage,
  parseRegistryDoc,
  parseRepository,
  RegistryNotFound,
  registryUrl,
} from "./npm";

describe("registryUrl", () => {
  it("encodes the slash of a scoped name", () => {
    expect(registryUrl("@tanstack/react-query")).toBe(
      "https://registry.npmjs.org/@tanstack%2freact-query",
    );
    expect(registryUrl("zod")).toBe("https://registry.npmjs.org/zod");
  });
});

describe("parseRepository", () => {
  it.each([
    ["git+https://github.com/colinhacks/zod.git", "colinhacks/zod"],
    ["https://github.com/date-fns/date-fns", "date-fns/date-fns"],
    ["git+ssh://git@github.com/TanStack/query.git", "tanstack/query"],
    ["git@github.com:ljharb/qs.git", "ljharb/qs"],
    ["github:prettier/prettier", "prettier/prettier"],
    ["vitest-dev/vitest", "vitest-dev/vitest"],
    ["https://github.com/foo/bar#readme", "foo/bar"],
  ])("%s -> %s", (url, fullName) => {
    expect(parseRepository(url)?.fullName).toBe(fullName);
  });

  it("reads the object form with a directory", () => {
    expect(
      parseRepository({
        type: "git",
        url: "https://github.com/tailwindlabs/tailwindcss.git",
        directory: "packages/tailwindcss",
      }),
    ).toEqual({ fullName: "tailwindlabs/tailwindcss", directory: "packages/tailwindcss" });
  });

  it("returns null for non-GitHub hosts and junk", () => {
    expect(parseRepository("https://gitlab.com/a/b")).toBeNull();
    expect(parseRepository("gitlab:a/b")).toBeNull();
    expect(parseRepository(undefined)).toBeNull();
    expect(parseRepository({ type: "git" })).toBeNull();
  });
});

describe("fundingLinks", () => {
  it("keeps Sponsors and Open Collective links from every funding form", () => {
    expect(
      fundingLinks([
        "https://github.com/sponsors/ljharb",
        { type: "opencollective", url: "https://opencollective.com/babel" },
        { type: "patreon", url: "https://patreon.com/x" },
        "https://tidelift.com/funding/github/npm/qs",
      ]),
    ).toEqual(["https://github.com/sponsors/ljharb", "https://opencollective.com/babel"]);
    expect(fundingLinks({ url: "https://github.com/sponsors/tannerlinsley" })).toEqual([
      "https://github.com/sponsors/tannerlinsley",
    ]);
    expect(fundingLinks(undefined)).toEqual([]);
  });
});

describe("parseRegistryDoc", () => {
  const doc = {
    name: "demo",
    "dist-tags": { latest: "2.0.0" },
    time: { created: "2020-03-07T21:19:15.387Z" },
    homepage: "https://demo.dev",
    repository: { url: "git+https://github.com/old/demo.git" },
    versions: {
      "1.0.0": { repository: "github:old/demo", funding: "https://github.com/sponsors/old" },
      "2.0.0": {
        repository: { url: "git+https://github.com/new/demo.git", directory: "packages/demo" },
        funding: "https://github.com/sponsors/new",
      },
    },
  };

  it("reads the latest version by default", () => {
    expect(parseRegistryDoc(doc)).toEqual({
      name: "demo",
      version: "2.0.0",
      repoFullName: "new/demo",
      repoDirectory: "packages/demo",
      homepage: "https://demo.dev",
      funding: "https://github.com/sponsors/new",
      fundingLinks: ["https://github.com/sponsors/new"],
      createdAt: new Date("2020-03-07T21:19:15.387Z"),
    });
  });

  it("reads the installed version when given", () => {
    const p = parseRegistryDoc(doc, "1.0.0");
    expect(p.repoFullName).toBe("old/demo");
    expect(p.fundingLinks).toEqual(["https://github.com/sponsors/old"]);
  });
});

describe("loadPackage errors", () => {
  const status = (code: number) => (async () => new Response("{}", { status: code })) as unknown as typeof fetch;

  it("throws RegistryNotFound on a 404 only", async () => {
    clearRegistryCache();
    await expect(loadPackage("@endcredits-demo/nope", { fetch: status(404) })).rejects.toBeInstanceOf(RegistryNotFound);
    const other = await loadPackage("@endcredits-demo/nope", { fetch: status(503) }).catch((e) => e);
    expect(other).toBeInstanceOf(Error);
    expect(other).not.toBeInstanceOf(RegistryNotFound);
  });
});

describe("loadPackage cache", () => {
  it("serves repeats from memory for an hour", async () => {
    clearRegistryCache();
    let calls = 0;
    const fakeFetch = (async (url: string) => {
      calls++;
      const body = url.includes("downloads")
        ? { downloads: 5 }
        : { name: "x", "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": {} } };
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    let t = 0;
    const opts = { fetch: fakeFetch, now: () => t };
    expect((await loadPackage("x", opts)).weeklyDownloads).toBe(5);
    t = 59 * 60 * 1000;
    await loadPackage("x", opts);
    expect(calls).toBe(2);
    t = 61 * 60 * 1000;
    await loadPackage("x", opts);
    expect(calls).toBe(4);
  });
});
