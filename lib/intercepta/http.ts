// One HTTP call with a hard deadline. The deadline races the fetch, so a fetch that ignores its
// abort signal still resolves to TIMEOUT (AGENTS rule 7: timeout means hold, never pay).
import type { ScreenError } from "../decision/types";

export type HttpOutcome =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; error: ScreenError; body: unknown };

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
    return { ok: false, status: res.status, error: "HTTP", body: { error: "HTTP", detail: text.slice(0, 500) } };
  }
  try {
    return { ok: true, status: res.status, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, error: "PARSE", body: { error: "PARSE", detail: text.slice(0, 500) } };
  }
}
