// Client-side JSON fetch. Errors come back as {error, ...} with the HTTP status; callers show them.
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; body: unknown };

export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const b = body as { message?: string; error?: string; code?: string } | null;
  return { ok: false, status: res.status, error: b?.message ?? b?.error ?? `HTTP ${res.status}`, body };
}
