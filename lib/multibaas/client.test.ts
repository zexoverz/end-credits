import { describe, expect, it, vi } from "vitest";
import { createMultiBaasClient, MultiBaasError } from "./client";

const KEY = "mb-test-key-do-not-log";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("multibaas client", () => {
  it("sends the bearer key to /api/v0 and unwraps the envelope", async () => {
    const fetch = vi.fn(async () => jsonResponse({ status: 200, message: "success", result: { rows: [1] } }));
    const mb = createMultiBaasClient({ baseUrl: "https://x.multibaas.com/", apiKey: KEY, fetch });

    await expect(mb.get("/queries/q/results?limit=5")).resolves.toEqual({ rows: [1] });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.multibaas.com/api/v0/queries/q/results?limit=5");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("sends a JSON body on PUT", async () => {
    const fetch = vi.fn(async () => jsonResponse({ status: 200, message: "success", result: null }));
    const mb = createMultiBaasClient({ baseUrl: "https://x", apiKey: KEY, fetch });
    await mb.put("/queries/q", { events: [] });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"events":[]}');
  });

  it("throws an http error carrying the envelope message and status", async () => {
    const fetch = vi.fn(async () => jsonResponse({ status: 404, message: "query not found", result: null }, 404));
    const mb = createMultiBaasClient({ baseUrl: "https://x", apiKey: KEY, fetch });
    const err = await mb.get("/queries/nope").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MultiBaasError);
    expect((err as MultiBaasError).kind).toBe("http");
    expect((err as MultiBaasError).status).toBe(404);
    expect((err as Error).message).toContain("query not found");
    expect((err as Error).message).not.toContain(KEY);
  });

  it("accepts a write answered with status and message but no result (PUT /queries)", async () => {
    const fetch = vi.fn(async () => jsonResponse({ status: 200, message: "success" }));
    const mb = createMultiBaasClient({ baseUrl: "https://x", apiKey: KEY, fetch });
    await expect(mb.put("/queries/q", {})).resolves.toBeUndefined();
  });

  it("rejects a 200 whose body is not the envelope", async () => {
    const fetch = vi.fn(async () => jsonResponse({ rows: [] }));
    const mb = createMultiBaasClient({ baseUrl: "https://x", apiKey: KEY, fetch });
    await expect(mb.get("/queries/q/results")).rejects.toMatchObject({ kind: "envelope" });
  });

  it("times out instead of hanging", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    const mb = createMultiBaasClient({ baseUrl: "https://x", apiKey: KEY, fetch, timeoutMs: 20 });
    await expect(mb.get("/events")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("maps a network failure to a network error without the key", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const mb = createMultiBaasClient({ baseUrl: "https://x", apiKey: KEY, fetch });
    const err = (await mb.get("/events").catch((e: unknown) => e)) as MultiBaasError;
    expect(err.kind).toBe("network");
    expect(err.message).not.toContain(KEY);
  });
});
