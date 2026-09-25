import { describe, expect, it } from "vitest";
import { ADDRESS_TTL_MS, CACHE_TTL_MS, freshScreen } from "./cache";
import { SCREEN_MAX_AGE_MS } from "../x402/constants";
import { memoryRepo } from "./__fixtures__/memory-repo";

const key = { kind: "address" as const, subject: "0xabc", chainId: null };
const row = { ...key, mappedFrom: null, response: { toxicScore: 0, traits: [] }, latencyMs: 5 };

describe("freshScreen", () => {
  it("reuses a successful token row younger than an hour", async () => {
    const t0 = new Date("2026-09-26T00:00:00Z");
    const { repo } = memoryRepo(() => t0);
    const tokenKey = { ...key, kind: "token" as const };
    const id = await repo.insert({ ...row, ...tokenKey, status: 200 });
    const hit = await freshScreen(repo, tokenKey, new Date(t0.getTime() + CACHE_TTL_MS - 1));
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

describe("address screens stay payable", () => {
  it("does not reuse an address screen past ADDRESS_TTL_MS, so x402 always sees one under 10 min", async () => {
    const t0 = new Date("2026-09-26T00:00:00Z");
    const key = { kind: "address" as const, subject: "0xabc", chainId: null };
    const repo = {
      latestOk: async () => ({ ...key, id: "s", mappedFrom: null, response: {}, status: 200, latencyMs: 1, fetchedAt: t0 }),
      insert: async () => "x",
    };
    expect(ADDRESS_TTL_MS).toBeLessThan(SCREEN_MAX_AGE_MS);
    expect(await freshScreen(repo, key, new Date(t0.getTime() + ADDRESS_TTL_MS - 1))).not.toBeNull();
    expect(await freshScreen(repo, key, new Date(t0.getTime() + ADDRESS_TTL_MS))).toBeNull();
    const token = { ...key, kind: "token" as const };
    expect(await freshScreen({ ...repo, latestOk: async () => ({ ...token, id: "t", mappedFrom: null, response: {}, status: 200, latencyMs: 1, fetchedAt: t0 }) }, token, new Date(t0.getTime() + ADDRESS_TTL_MS))).not.toBeNull();
  });
});
