// The maintainer's cookie session (`ec_maint`, iron-session sealed with SESSION_SECRET). It holds
// the OAuth state during sign-in and the maintainer id after it. Never the GitHub token.
import { getIronSession, webCookies, type SessionOptions } from "iron-session";

export const MAINT_COOKIE = "ec_maint";
const TTL_SECONDS = 24 * 60 * 60;

export type MaintSession = {
  maintainerId?: string;
  oauth?: { state: string; verifier: string; pkg: string };
};

export type SessionConfig = { secret: string; appUrl: string };

export function sessionOptions(cfg: SessionConfig): SessionOptions {
  return {
    cookieName: MAINT_COOKIE,
    password: cfg.secret,
    ttl: TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // lax: the cookie must come back on GitHub's top-level redirect to the callback.
      sameSite: "lax",
      secure: cfg.appUrl.startsWith("https://"),
      path: "/",
    },
  };
}

// `out` collects Set-Cookie headers for the response.
export function maintSession(req: Request, out: Headers, cfg: SessionConfig) {
  return getIronSession<MaintSession>(webCookies(req, out), sessionOptions(cfg));
}
