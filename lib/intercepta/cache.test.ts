import { describe, expect, it } from "vitest";
import { CACHE_TTL_MS, freshScreen } from "./cache";
import { memoryRepo } from "./__fixtures__/memory-repo";

const key = { kind: "address" as const, subject: "0xabc", chainId: null };
const row = { ...key, mappedFrom: null, response: { toxicScore: 0, traits: [] }, latencyMs: 5 };

describe("freshScreen", () => {
  it("reuses a successful row younger than an hour", async () => {
    const t0 = new Date("2026-09-26T00:00:00Z");
    const { repo } = memoryRepo(() => t0);
    const id = await repo.insert({ ...row, status: 200 });
    const hit = await freshScreen(repo, key, new Date(t0.getTime() + CACHE_TTL_MS - 1));
    expect(hit?.id).toBe(id);
  });

  it("ignores a row an hour old or more", async () => {
    const t0 = new Date("2026-09-26T00:00:00Z");
    const { repo } = memoryRepo(() => t0);
    await repo.insert({ ...row, status: 200 });
    expect(await freshScreen(repo, key, new Date(t0.getTime() + CACHE_TTL_MS))).toBeNull();
  });

  it("never reuses a failed call", async () => {
    const { repo } = memoryRepo();
    await repo.insert({ ...row, status: 500 });
    expect(await freshScreen(repo, key, new Date())).toBeNull();
  });

  it("keys on kind, subject and chain", async () => {
    const { repo } = memoryRepo();
    await repo.insert({ ...row, status: 200 });
    expect(await freshScreen(repo, { ...key, chainId: 8453 }, new Date())).toBeNull();
    expect(await freshScreen(repo, { ...key, kind: "token" }, new Date())).toBeNull();
    expect(await freshScreen(repo, { ...key, subject: "0xdef" }, new Date())).toBeNull();
  });
});
