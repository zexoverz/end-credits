import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devTokenMatches, getOwnerSession, worldRequired, writeOwnerSession } from "./owner";

async function sealOwnerCookie(ownerId: string): Promise<string> {
  const headers = new Headers();
  await writeOwnerSession(new Request("https://t.test/"), headers, ownerId);
  return headers.get("set-cookie")!.split(";")[0];
}

const SECRET = "x".repeat(40);
const saved = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.OWNER_DEV_TOKEN = "dev-token-123";
  delete process.env.WORLD_REQUIRED;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("devTokenMatches", () => {
  it("accepts the exact token only", () => {
    expect(devTokenMatches("dev-token-123")).toBe(true);
    expect(devTokenMatches("dev-token-124")).toBe(false);
    expect(devTokenMatches("dev-token-1234")).toBe(false);
    expect(devTokenMatches("")).toBe(false);
  });

  it("is off when OWNER_DEV_TOKEN is unset", () => {
    delete process.env.OWNER_DEV_TOKEN;
    expect(devTokenMatches("")).toBe(false);
    expect(devTokenMatches("undefined")).toBe(false);
  });

  it("is off when WORLD_REQUIRED=true", () => {
    process.env.WORLD_REQUIRED = "true";
    expect(worldRequired()).toBe(true);
    expect(devTokenMatches("dev-token-123")).toBe(false);
  });
});

describe("owner session cookie", () => {
  const withCookie = (cookie: string) => new Request("https://t.test/", { headers: { cookie } });

  it("round-trips the owner id", async () => {
    const cookie = await sealOwnerCookie("11111111-1111-4111-8111-111111111111");
    expect(await getOwnerSession(withCookie(cookie))).toEqual({
      ownerId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("returns null without a cookie or with a forged one", async () => {
    expect(await getOwnerSession(new Request("https://t.test/"))).toBeNull();
    expect(await getOwnerSession(withCookie("ec_owner=Fe26.2**forged"))).toBeNull();
  });

  it("rejects a cookie sealed with another secret", async () => {
    const cookie = await sealOwnerCookie("11111111-1111-4111-8111-111111111111");
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(await getOwnerSession(withCookie(cookie))).toBeNull();
  });
});
