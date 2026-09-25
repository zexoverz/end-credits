// Unit tests for the Intercepta client. fetch is a spy here; product code always calls the real API.
import { describe, expect, it, vi } from "vitest";
import { createIntercepta } from "./client";
import { BASE_USDC } from "./mapping";
import { memoryRepo } from "./__fixtures__/memory-repo";

const PAYEE = "0xAbCdEf0000000000000000000000000000001234";
const PAYER = "0x9999999999999999999999999999999999999999";
const BASE = "https://intercepta.test";

const clean = { toxicScore: 0, traits: [] };
const tokenOk = { action: "info", riskLevel: "neutral", riskScore: 0, detectors: [] };
const notPoisoned = { isAddressPoisoned: false, originalAddress: "" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Routes by path so screenPayee's parallel calls each get their own answer.
function router(routes: Record<string, () => Promise<Response> | Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [part, respond] of Object.entries(routes)) if (url.includes(part)) return respond();
    throw new Error(`unrouted ${url}`);
  });
}

const hanging = () => new Promise<Response>(() => {});

function client(fetchSpy: ReturnType<typeof router>, timeoutMs = 8000) {
  const { repo, rows } = memoryRepo();
  let t = 0;
  const c = createIntercepta({
    base: BASE,
    apiKey: "test-key",
    fetch: fetchSpy as unknown as typeof fetch,
    repo,
    timeoutMs,
    clock: () => (t += 7),
  });
  return { c, rows };
}

describe("quickScan", () => {
  it("calls the quick-scan path with the key header and stores the row with latency", async () => {
    const f = router({ "/quick-scan": () => json(clean) });
    const { c, rows } = client(f);
    const r = await c.quickScan(PAYEE);
    expect(r).toMatchObject({ ok: true, data: { toxicScore: 0, traits: [] } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/public/v2/extension/account/${PAYEE.toLowerCase()}/quick-scan`);
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("test-key");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "address", subject: PAYEE.toLowerCase(), chainId: null, status: 200, latencyMs: 7 });
  });

  it("reuses a cached row and skips the network", async () => {
    const f = router({ "/quick-scan": () => json(clean) });
    const { c } = client(f);
    await c.quickScan(PAYEE);
    const again = await c.quickScan(PAYEE);
    expect(again.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("failure policy", () => {
  it("a fetch that never answers becomes TIMEOUT after the deadline", async () => {
    const f = router({ "/quick-scan": hanging });
    const { c, rows } = client(f, 20);
    const r = await c.quickScan(PAYEE);
    expect(r).toMatchObject({ ok: false, error: "TIMEOUT" });
    expect(rows[0]).toMatchObject({ status: 0, response: { error: "TIMEOUT" } });
  });

  it("aborts the request signal on timeout", async () => {
    let signal: AbortSignal | undefined;
    const f = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return hanging();
    });
    const { c } = client(f as unknown as ReturnType<typeof router>, 20);
    await c.quickScan(PAYEE);
    expect(signal?.aborted).toBe(true);
  });

  it("a non-2xx answer becomes HTTP", async () => {
    const { c } = client(router({ "/quick-scan": () => json({ message: "Forbidden" }, 403) }));
    expect(await c.quickScan(PAYEE)).toMatchObject({ ok: false, error: "HTTP" });
  });

  it("a network error becomes HTTP", async () => {
    const { c } = client(router({ "/quick-scan": () => Promise.reject(new TypeError("fetch failed")) }));
    expect(await c.quickScan(PAYEE)).toMatchObject({ ok: false, error: "HTTP" });
  });

  it("a body that is not the documented shape becomes PARSE", async () => {
    const { c } = client(router({ "/quick-scan": () => json({ score: "high" }) }));
    expect(await c.quickScan(PAYEE)).toMatchObject({ ok: false, error: "PARSE" });
  });

  it("a failed call is not cached", async () => {
    const f = router({ "/quick-scan": () => json({}, 500) });
    const { c } = client(f);
    await c.quickScan(PAYEE);
    await c.quickScan(PAYEE);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("tokenRisks", () => {
  it("screens Base Sepolia USDC as Base USDC on 8453 and records the mapping", async () => {
    const f = router({ "/risks": () => json(tokenOk) });
    const { c, rows } = client(f);
    const r = await c.tokenRisks("0x036CbD53842c5426634e7929541eC2318f3dCF7e", 84532);
    expect(r).toMatchObject({ ok: true, data: { action: "info" } });
    expect(String(f.mock.calls[0][0])).toBe(
      `${BASE}/api/public/v2/extension/token-intelligence/token/${BASE_USDC.toLowerCase()}/risks?chainId=8453`,
    );
    expect(rows[0]).toMatchObject({
      kind: "token",
      chainId: 8453,
      mappedFrom: "eip155:84532/0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    });
  });
});

describe("simulateTransfer", () => {
  it("posts a USDC transfer to the payee on 8453", async () => {
    const f = router({ "/simulation/transaction": () => json({ detectors: [], assetsMovement: { send: [], receive: [] } }) });
    const { c } = client(f);
    const r = await c.simulateTransfer({ from: PAYER, to: PAYEE, amount: BigInt(250000) });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/public/v1/extension/simulation/transaction?chainId=8453`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.transaction.from).toBe(PAYER);
    expect(body.transaction.to).toBe(BASE_USDC);
    expect(body.transaction.data.startsWith("0xa9059cbb")).toBe(true);
    expect(body.transaction.data).toContain(PAYEE.slice(2).toLowerCase());
  });
});

describe("screenPayee", () => {
  const opts = { from: PAYER, amount: BigInt(250000) };

  it("combines quick scan, impersonation and token risks into one Screen", async () => {
    const f = router({
      "/quick-scan": () => json({ toxicScore: 30, traits: [{ name: "mixer_transfers", risk: 30, txsCount: 2, description: "Mixer use" }] }),
      "/check-address/": () => json(notPoisoned),
      "/risks": () => json({ ...tokenOk, action: "warn", detectors: [{ code: "PROXY_PATTERN", description: "Proxy" }] }),
    });
    const { c } = client(f);
    const s = await c.screenPayee(PAYEE, opts);
    expect(s).toEqual({
      toxicScore: 30,
      traits: [{ name: "mixer_transfers", description: "Mixer use" }],
      tokenAction: "warn",
      tokenDetectors: [{ code: "PROXY_PATTERN", description: "Proxy" }],
      impersonation: null,
      screenIds: expect.any(Array),
    });
    expect(s.screenIds).toHaveLength(3);
    expect(f.mock.calls.some(([u]) => String(u).includes("/simulation/"))).toBe(false);
  });

  it("reports a poisoned address with the original it imitates", async () => {
    const f = router({
      "/quick-scan": () => json(clean),
      "/check-address/": () => json({ isAddressPoisoned: true, originalAddress: "0xabcd00000000000000000000000000000000abcd" }),
      "/risks": () => json(tokenOk),
    });
    const s = await client(f).c.screenPayee(PAYEE, opts);
    expect(s.impersonation).toEqual({ original: "0xabcd00000000000000000000000000000000abcd" });
  });

  it("falls back to simulation when quick scan fails, keeping its detectors", async () => {
    const f = router({
      "/quick-scan": () => json({}, 502),
      "/check-address/": () => json(notPoisoned),
      "/risks": () => json(tokenOk),
      "/simulation/transaction": () => json({ detectors: [{ code: "SCAM_ADDRESS", description: "Known scam address" }], assetsMovement: { send: [], receive: [] } }),
    });
    const s = await client(f).c.screenPayee(PAYEE, opts);
    expect(s.error).toBeUndefined();
    expect(s.traits).toEqual([{ name: "SCAM_ADDRESS", description: "Known scam address" }]);
  });

  it("sets error when quick scan and simulation both fail", async () => {
    const f = router({
      "/quick-scan": hanging,
      "/check-address/": () => json(notPoisoned),
      "/risks": () => json(tokenOk),
      "/simulation/transaction": () => json({}, 500),
    });
    const s = await client(f, 20).c.screenPayee(PAYEE, opts);
    expect(s.error).toBe("TIMEOUT");
  });

  it("sets error when the token screen fails", async () => {
    const f = router({
      "/quick-scan": () => json(clean),
      "/check-address/": () => json(notPoisoned),
      "/risks": () => json("nope"),
    });
    expect((await client(f).c.screenPayee(PAYEE, opts)).error).toBe("PARSE");
  });

  it("sets error when the impersonation check fails", async () => {
    const f = router({
      "/quick-scan": () => json(clean),
      "/check-address/": () => json({}, 500),
      "/risks": () => json(tokenOk),
    });
    expect((await client(f).c.screenPayee(PAYEE, opts)).error).toBe("HTTP");
  });
});
