import { describe, expect, it } from "vitest";
import { loadPackage } from "./npm";

describe.skipIf(!process.env.LIVE)("npm registry (live)", () => {
  it("zod", async () => {
    const p = await loadPackage("zod");
    expect(p.repoFullName).toBe("colinhacks/zod");
    expect(p.homepage).toBe("https://zod.dev");
    expect(p.fundingLinks).toContain("https://github.com/sponsors/colinhacks");
    expect(p.createdAt).toEqual(new Date("2020-03-07T21:19:15.387Z"));
    expect(p.weeklyDownloads).toBeGreaterThan(1_000_000);
  });

  it("@tanstack/react-query", async () => {
    const p = await loadPackage("@tanstack/react-query");
    expect(p.repoFullName).toBe("tanstack/query");
    expect(p.repoDirectory).toBe("packages/react-query");
    expect(p.fundingLinks).toContain("https://github.com/sponsors/tannerlinsley");
    expect(p.weeklyDownloads).toBeGreaterThan(1_000_000);
  });

  it("tailwindcss", async () => {
    const p = await loadPackage("tailwindcss");
    expect(p.repoFullName).toBe("tailwindlabs/tailwindcss");
    expect(p.repoDirectory).toBe("packages/tailwindcss");
    expect(p.homepage).toBe("https://tailwindcss.com");
    expect(p.createdAt).toEqual(new Date("2017-10-06T15:05:20.621Z"));
    expect(p.weeklyDownloads).toBeGreaterThan(1_000_000);
  });
});
