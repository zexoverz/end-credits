// Plain-fetch MultiBaas REST v0 client. Bearer auth, `{status, message, result}` envelope, 8 s
// deadline. The API key is only ever put in the Authorization header, never in a message.
import { readEnv } from "../env";

export type MultiBaasErrorKind = "timeout" | "network" | "http" | "envelope" | "parse";

export class MultiBaasError extends Error {
  constructor(
    message: string,
    readonly kind: MultiBaasErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MultiBaasError";
  }
}

export interface MultiBaasClient {
  get<T = unknown>(path: string): Promise<T>;
  put<T = unknown>(path: string, body: unknown): Promise<T>;
  post<T = unknown>(path: string, body: unknown): Promise<T>;
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 8_000;

type Envelope = { status: number; message: string; result: unknown };

function isEnvelope(v: unknown): v is Envelope {
  return (
    typeof v === "object" &&
    v !== null &&
    "status" in v &&
    "message" in v &&
    typeof (v as Envelope).message === "string"
  );
}

export function createMultiBaasClient(opts: ClientOptions): MultiBaasClient {
  const base = `${opts.baseUrl.replace(/\/+$/, "")}/api/v0`;
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const where = `${method} ${path.split("?")[0]}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new MultiBaasError(`MultiBaas ${where}: timed out after ${timeoutMs} ms`, "timeout"));
      }, timeoutMs);
    });
    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.apiKey}`,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    let text: string;
    try {
      const request = (async () => {
        const r = await doFetch(`${base}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        });
        return [r, await r.text()] as const;
      })();
      [res, text] = await Promise.race([request, deadline]);
    } catch (e) {
      if (e instanceof MultiBaasError) throw e;
      throw new MultiBaasError(`MultiBaas ${where}: ${(e as Error).message}`, "network");
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const detail = isEnvelope(json) ? json.message : `HTTP ${res.status}`;
      throw new MultiBaasError(`MultiBaas ${where}: ${res.status} ${detail}`, "http", res.status);
    }
    // Reads must carry `result`; writes like PUT /queries answer with status and message only.
    if (!isEnvelope(json) || (method === "GET" && !("result" in json))) {
      throw new MultiBaasError(`MultiBaas ${where}: response is not the {status,message,result} envelope`, "envelope", res.status);
    }
    return json.result as T;
  }

  return {
    get: (path) => call("GET", path),
    put: (path, body) => call("PUT", path, body),
    post: (path, body) => call("POST", path, body),
  };
}

let cached: MultiBaasClient | undefined;

export function multibaasFromEnv(): MultiBaasClient {
  cached ??= createMultiBaasClient({
    baseUrl: readEnv("MULTIBAAS_URL"),
    apiKey: readEnv("MULTIBAAS_API_KEY"),
  });
  return cached;
}
