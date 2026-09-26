// One HTTP call with a hard deadline. The deadline races the fetch, so a fetch that ignores its
// abort signal still resolves to TIMEOUT (AGENTS rule 7: timeout means hold, never pay).
import type { ScreenError } from "../decision/types";

export type HttpOutcome =
  | { ok: true; status: number; body: unknown }
  // `raw` is the error body parsed as JSON, when it is JSON (the no-history 404 needs it).
  | { ok: false; status: number; error: ScreenError; body: unknown; raw?: unknown };

const TIMED_OUT = Symbol("timeout");

export async function timedJson(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<HttpOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(TIMED_OUT);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([readJson(fetchFn, url, { ...init, signal: controller.signal }), deadline]);
    if (result === TIMED_OUT) return { ok: false, status: 0, error: "TIMEOUT", body: { error: "TIMEOUT" } };
    return result;
  } catch {
    if (controller.signal.aborted) return { ok: false, status: 0, error: "TIMEOUT", body: { error: "TIMEOUT" } };
    return { ok: false, status: 0, error: "HTTP", body: { error: "HTTP", detail: "network error" } };
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<HttpOutcome> {
  const res = await fetchFn(url, init);
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: "HTTP", body: { error: "HTTP", detail: text.slice(0, 500) }, raw: parseOrUndefined(text) };
  }
  try {
    return { ok: true, status: res.status, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, error: "PARSE", body: { error: "PARSE", detail: text.slice(0, 500) } };
  }
}

// Worth one more try: a timeout, a network error, a 5xx or a 429. Any other 4xx (including the
// no-history 404) and a body we cannot parse would answer the same again.
export function transient(res: HttpOutcome): boolean {
  if (res.ok || res.error === "PARSE") return false;
  return res.error === "TIMEOUT" || res.status === 0 || res.status >= 500 || res.status === 429;
}

function parseOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
