// Unit tests for the Intercepta client. fetch is a spy here; product code always calls the real API.
import { describe, expect, it, vi } from "vitest";
import { SIMULATION_FROM, createIntercepta } from "./client";
import { BASE_USDC } from "./mapping";
import { memoryRepo } from "./__fixtures__/memory-repo";
import { NO_HISTORY_BODY } from "./no-history";

const PAYEE = "0xAbCdEf0000000000000000000000000000001234" as const;
const PAYER = "0x9999999999999999999999999999999999999999" as const;
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

// Answers in order, one per call; the last answer repeats.
function sequence(...answers: Array<() => Promise<Response> | Response>) {
  let i = 0;
  return () => answers[Math.min(i++, answers.length - 1)]();
}

function client(fetchSpy: ReturnType<typeof router>, timeoutMs = 8000, retryDelayMs = 0) {
  const { repo, rows } = memoryRepo();
  let t = 0;
  const c = createIntercepta({
    base: BASE,
    apiKey: "test-key",
    fetch: fetchSpy as unknown as typeof fetch,
    repo,
    timeoutMs,
    retryDelayMs,
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

describe("quickScan: address with no mainnet history", () => {
  it("the no-history 404 is a clean screen marked noHistory, stored with status 404 and the raw body", async () => {
    const { c, rows } = client(router({ "/quick-scan": () => json(NO_HISTORY_BODY, 404) }));
    const r = await c.quickScan(PAYEE);
    expect(r).toEqual({ ok: true, data: { toxicScore: 0, traits: [], noHistory: true }, screenId: rows[0].id });
    expect(rows[0]).toMatchObject({ kind: "address", status: 404, response: NO_HISTORY_BODY });
  });

  it("is reused from the cache like a 200", async () => {
    const f = router({ "/quick-scan": () => json(NO_HISTORY_BODY, 404) });
    const { c } = client(f);
    await c.quickScan(PAYEE);
    const again = await c.quickScan(PAYEE);
    expect(again).toMatchObject({ ok: true, data: { noHistory: true } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("any other 404 stays an HTTP error", async () => {
    const f = router({ "/quick-scan": () => json({ status: 404, response: { statusCode: 404, message: "Not Found" } }, 404) });
    const { c } = client(f);
    expect(await c.quickScan(PAYEE)).toMatchObject({ ok: false, error: "HTTP" });
    await c.quickScan(PAYEE);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("the no-history body on the impersonation route is still an error", async () => {
    const { c } = client(router({ "/check-address/": () => json(NO_HISTORY_BODY, 404) }));
    expect(await c.checkImpersonation(PAYEE)).toMatchObject({ ok: false, error: "HTTP" });
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
    expect(f).toHaveBeenCalledTimes(4); // two calls, each with its one retry
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

describe("simulatePayment", () => {
  const sim = { detectors: [], assetsMovement: { send: [], receive: [] } };

  it("sends the exact transfer from the funded holder and notes the payer it stands in for", async () => {
    const f = router({ "/simulation/transaction": () => json(sim) });
    const { c, rows } = client(f);
    const r = await c.simulatePayment({ payer: PAYER, payee: PAYEE, amount: BigInt(250000) });
    expect(r.ok).toBe(true);
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.transaction.from).toBe(SIMULATION_FROM);
    expect(body.transaction.to).toBe(BASE_USDC);
    expect(body.transaction.data).toBe(
      "0xa9059cbb000000000000000000000000abcdef0000000000000000000000000000001234000000000000000000000000000000000000000000000000000000000003d090",
    );
    expect(rows[0]).toMatchObject({ kind: "simulation", subject: `${PAYEE.toLowerCase()}/250000`, chainId: 8453 });
    expect(rows[0].mappedFrom).toContain(`payer ${PAYER.toLowerCase()} simulated as ${SIMULATION_FROM.toLowerCase()}`);
  });

  it("does not reuse a simulation of a different amount to the same payee", async () => {
    const f = router({ "/simulation/transaction": () => json(sim) });
    const { c } = client(f);
    await c.simulatePayment({ payer: PAYER, payee: PAYEE, amount: BigInt(250000) });
    await c.simulatePayment({ payer: PAYER, payee: PAYEE, amount: BigInt(100000) });
    expect(f).toHaveBeenCalledTimes(2);
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

  it("marks a no-history payee and does not fall back to simulation", async () => {
    const f = router({
      "/quick-scan": () => json(NO_HISTORY_BODY, 404),
      "/check-address/": () => json(notPoisoned),
      "/risks": () => json(tokenOk),
    });
    const s = await client(f).c.screenPayee(PAYEE, opts);
    expect(s).toMatchObject({ toxicScore: 0, traits: [], noHistory: true });
    expect(s.error).toBeUndefined();
    expect(f.mock.calls.some(([u]) => String(u).includes("/simulation/"))).toBe(false);
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

describe("retry once on a transient failure", () => {
  it("timeout then 200 succeeds and stores both attempts", async () => {
    const f = router({ "/quick-scan": sequence(hanging, () => json(clean)) });
    const { c, rows } = client(f, 20);
    const r = await c.quickScan(PAYEE);
    expect(r).toMatchObject({ ok: true, data: { toxicScore: 0 } });
    expect(f).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "address", status: 0, response: { error: "TIMEOUT" } });
    expect(rows[1]).toMatchObject({ kind: "address", status: 200 });
    expect(r.screenId).toBe(rows[1].id);
  });

  it("503 then 200 succeeds", async () => {
    const f = router({ "/check-address/": sequence(() => json({}, 503), () => json(notPoisoned)) });
    const { c, rows } = client(f);
    expect(await c.checkImpersonation(PAYEE)).toMatchObject({ ok: true, data: { isAddressPoisoned: false } });
    expect(rows.map((r) => r.status)).toEqual([503, 200]);
  });

  it("429 then 200 succeeds", async () => {
    const f = router({ "/risks": sequence(() => json({}, 429), () => json(tokenOk)) });
    expect(await client(f).c.tokenRisks(BASE_USDC, 8453)).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("a network error then 200 succeeds", async () => {
    const f = router({
      "/simulation/transaction": sequence(
        () => Promise.reject(new TypeError("fetch failed")),
        () => json({ detectors: [], assetsMovement: { send: [], receive: [] } }),
      ),
    });
    expect(await client(f).c.simulateTransfer({ from: PAYER, to: PAYEE, amount: BigInt(1) })).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry the no-history 404", async () => {
    const f = router({ "/quick-scan": () => json(NO_HISTORY_BODY, 404) });
    expect(await client(f).c.quickScan(PAYEE)).toMatchObject({ ok: true, data: { noHistory: true } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does not retry another 4xx", async () => {
    const f = router({ "/check-address/": () => json(NO_HISTORY_BODY, 404) });
    expect(await client(f).c.checkImpersonation(PAYEE)).toMatchObject({ ok: false, error: "HTTP" });
    const g = router({ "/quick-scan": () => json({ message: "Forbidden" }, 403) });
    await client(g).c.quickScan(PAYEE);
    expect(f).toHaveBeenCalledTimes(1);
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("does not retry a parse error", async () => {
    const f = router({ "/quick-scan": () => json({ score: "high" }) });
    expect(await client(f).c.quickScan(PAYEE)).toMatchObject({ ok: false, error: "PARSE" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("timeout twice stays TIMEOUT after exactly one retry", async () => {
    const f = router({ "/quick-scan": hanging });
    const { c, rows } = client(f, 20);
    const r = await c.quickScan(PAYEE);
    expect(r).toMatchObject({ ok: false, error: "TIMEOUT" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(r.screenId).toBe(rows[1].id);
  });

  it("a server error that persists is tried exactly twice", async () => {
    const f = router({ "/risks": () => json({}, 500) });
    expect(await client(f).c.tokenRisks(BASE_USDC, 8453)).toMatchObject({ ok: false, error: "HTTP" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("waits the retry delay before the second attempt", async () => {
    const at: number[] = [];
    const f = router({ "/quick-scan": () => (at.push(Date.now()), json({}, 503)) });
    await client(f, 8000, 60).c.quickScan(PAYEE);
    expect(at).toHaveLength(2);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(50);
  });

  it("screenPayee: an impersonation timeout then 200 is a clean screen, not held", async () => {
    const f = router({
      "/quick-scan": () => json(clean),
      "/check-address/": sequence(hanging, () => json(notPoisoned)),
      "/risks": () => json(tokenOk),
    });
    const s = await client(f, 20).c.screenPayee(PAYEE, { from: PAYER, amount: BigInt(250000) });
    expect(s.error).toBeUndefined();
    expect(s.impersonation).toBeNull();
  });

  it("screenPayee: an impersonation that times out twice still sets error (held)", async () => {
    const f = router({
      "/quick-scan": () => json(clean),
      "/check-address/": hanging,
      "/risks": () => json(tokenOk),
    });
    const s = await client(f, 20).c.screenPayee(PAYEE, { from: PAYER, amount: BigInt(250000) });
    expect(s.error).toBe("TIMEOUT");
  });
});
