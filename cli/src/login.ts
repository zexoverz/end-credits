// `endcredits login` (DESIGN §14.4): World ID device grant through the End Credits API. Prints the
// code and link to stderr, polls at the server's interval (+5 s on slow_down), and on approval writes
// the agent key to ~/.endcredits/config.json (mode 600). Denied, expired or not an owner: no key.
import { cliMsg } from "../../lib/messages";
import { DEFAULT_API_URL, readConfig, writeConfig } from "./config";

export interface LoginDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  say: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  hostname: () => string;
}

interface Started {
  id: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string | null;
  interval: number;
  expires_in: number;
}

const SLOW_DOWN_STEP_S = 5;
const REQUEST_TIMEOUT_MS = 15_000;

function post(deps: LoginDeps, url: string, body?: unknown): Promise<Response> {
  return deps.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function parseStarted(raw: unknown): Started {
  const b = (raw ?? {}) as Partial<Started>;
  if (typeof b.id !== "string" || typeof b.user_code !== "string" || typeof b.verification_uri !== "string") {
    throw new Error("unexpected start response");
  }
  return {
    id: b.id,
    user_code: b.user_code,
    verification_uri: b.verification_uri,
    verification_uri_complete: typeof b.verification_uri_complete === "string" ? b.verification_uri_complete : null,
    interval: typeof b.interval === "number" && b.interval > 0 ? b.interval : 5,
    expires_in: typeof b.expires_in === "number" && b.expires_in > 0 ? b.expires_in : 600,
  };
}

const STOPS: Record<string, "LOGIN_DENIED" | "LOGIN_EXPIRED" | "LOGIN_NO_OWNER"> = {
  access_denied: "LOGIN_DENIED",
  expired_token: "LOGIN_EXPIRED",
  no_owner: "LOGIN_NO_OWNER",
};

export async function runLogin(home: string, apiArg: string | undefined, deps: LoginDeps): Promise<number> {
  const api = new URL(apiArg ?? readConfig(home)?.apiUrl ?? DEFAULT_API_URL).origin;
  try {
    const res = await post(deps, `${api}/api/agent/device/start`);
    if (!res.ok) throw new Error(`start answered ${res.status}`);
    const started = parseStarted(await res.json());
    deps.say(
      cliMsg("LOGIN_CODE", {
        url: started.verification_uri_complete ?? started.verification_uri,
        code: started.user_code,
      }),
    );

    let interval = started.interval;
    let waited = 0;
    const label = `${deps.hostname()}, Claude Code`;
    while (waited + interval <= started.expires_in) {
      await deps.sleep(interval * 1000);
      waited += interval;
      const poll = await post(deps, `${api}/api/agent/device/poll`, { id: started.id, label });
      const body = (await poll.json().catch(() => ({}))) as { status?: string; token?: string; code?: string };
      if (body.status === "authorization_pending") continue;
      if (body.status === "slow_down") {
        interval += SLOW_DOWN_STEP_S;
        continue;
      }
      if (body.status === "complete" && typeof body.token === "string") {
        deps.say(cliMsg("LOGIN_SAVED", { path: writeConfig(home, body.token, api) }));
        return 0;
      }
      const stop = body.status ? STOPS[body.status] : undefined;
      if (stop) {
        deps.say(cliMsg(stop));
        return 1;
      }
      throw new Error(body.code ?? body.status ?? `poll answered ${poll.status}`);
    }
    deps.say(cliMsg("LOGIN_EXPIRED"));
    return 1;
  } catch (err) {
    deps.say(cliMsg("LOGIN_FAILED", { error: (err as Error).message }));
    return 1;
  }
}
