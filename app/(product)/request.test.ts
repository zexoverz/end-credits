import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/components/product/request";

afterEach(() => vi.unstubAllGlobals());
describe("frontend request error states", () => {
  it("returns a network failure to the caller instead of leaving its loading state unresolved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/api/owner")).resolves.toEqual({ ok: false, status: 0, error: "Failed to fetch", body: null });
  });
  it("preserves server messages and status codes for existing action-specific guards", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "not_owner", message: "Only the owner can approve." }, { status: 403 })));
    await expect(api("/api/approve/test/start", { method: "POST" })).resolves.toEqual({ ok: false, status: 403, error: "Only the owner can approve.", body: { error: "not_owner", message: "Only the owner can approve." } });
  });
});
