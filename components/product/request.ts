// Keep network failures in the same visible error states as server failures.
import { api as request, type ApiResult } from "@/lib/client/api";
export type { ApiResult } from "@/lib/client/api";
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    return await request<T>(path, init);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      body: null,
    };
  }
}
