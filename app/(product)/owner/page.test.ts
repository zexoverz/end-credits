import { describe, it, expect, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/owner", () => ({ getOwnerSession: session }));
vi.mock("./owner-client", () => ({ OwnerClient: () => null }));
import OwnerPage from "./page";
describe("owner session bootstrap", () => {
  it("starts signed out without passing a session to the browser", async () => {
    session.mockResolvedValue(null);
    const page = await OwnerPage({
      searchParams: Promise.resolve({}),
      params: Promise.resolve({}),
    });
    expect(page.props.initialSignedIn).toBe(false);
    expect(Object.keys(page.props).sort()).toEqual([
      "initialSection",
      "initialSignedIn",
      "worldCode",
    ]);
  });
  it("allows the protected API read when a server session exists", async () => {
    session.mockResolvedValue({ ownerId: "test-owner" });
    const page = await OwnerPage({
      searchParams: Promise.resolve({}),
      params: Promise.resolve({}),
    });
    expect(page.props.initialSignedIn).toBe(true);
    expect(JSON.stringify(page.props)).not.toContain("test-owner");
  });
});
