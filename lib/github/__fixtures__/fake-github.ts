// Test-only in-memory GitHub: just the endpoints the claim flow calls. Nothing here reaches the
// network.
import { createHash } from "node:crypto";

type Perms = { admin: boolean; push: boolean; pull: boolean };
type Pull = { number: number; head: string; base: string; merged: boolean; mergeSha: string | null };

export type FakeRepo = {
  defaultBranch: string;
  perms: Record<string, Perms>; // by token
  branches: Record<string, string>; // name -> sha
  files: Record<string, Record<string, string>>; // branch -> path -> text
  pulls: Pull[];
};

export type FakeGitHub = {
  fetch: typeof fetch;
  repos: Record<string, FakeRepo>;
  users: Record<string, { id: number; login: string }>; // by token
  calls: { method: string; path: string; token: string | null }[];
  // Force a status for "METHOD /path" (path without the query).
  fail: Record<string, number>;
  // OAuth code -> token for POST github.com/login/oauth/access_token.
  codes: Record<string, string>;
  addRepo(name: string, r?: Partial<FakeRepo>): FakeRepo;
  merge(repo: string, n: number): void;
};

const sha = (s: string) => createHash("sha1").update(s).digest("hex");
const json = (status: number, body: unknown) => Response.json(body, { status });

export function fakeGitHub(): FakeGitHub {
  const gh: FakeGitHub = {
    repos: {},
    users: {},
    calls: [],
    fail: {},
    codes: {},
    fetch: undefined as unknown as typeof fetch,
    addRepo(name, r = {}) {
      const repo: FakeRepo = {
        defaultBranch: "main",
        perms: {},
        branches: { main: sha(`${name}:main`) },
        files: { main: {} },
        pulls: [],
        ...r,
      };
      gh.repos[name] = repo;
      return repo;
    },
    merge(name, n) {
      const repo = gh.repos[name];
      const pr = repo.pulls.find((p) => p.number === n)!;
      pr.merged = true;
      pr.mergeSha = sha(`merge:${name}:${n}`);
      repo.files[pr.base] = { ...repo.files[pr.base], ...repo.files[pr.head] };
      repo.branches[pr.base] = pr.mergeSha;
    },
  };

  gh.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const token = headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
    const path = url.pathname;
    gh.calls.push({ method, path, token });
    const forced = gh.fail[`${method} ${path}`];
    if (forced) return json(forced, { message: "forced" });

    if (url.host === "github.com" && path === "/login/oauth/access_token") {
      const body = new URLSearchParams(String(init?.body));
      const t = gh.codes[body.get("code") ?? ""];
      return t ? json(200, { access_token: t, token_type: "bearer", scope: "public_repo" })
        : json(200, { error: "bad_verification_code" });
    }
    if (path === "/user") {
      const u = token ? gh.users[token] : undefined;
      return u ? json(200, u) : json(401, { message: "Bad credentials" });
    }
    const m = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    const repo = m ? gh.repos[m[1]] : undefined;
    if (!m || !repo) return json(404, { message: "Not Found" });
    const name = m[1];
    const rest = m[2] ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (rest === "" && method === "GET") {
      const permissions = token ? (repo.perms[token] ?? { admin: false, push: false, pull: true }) : undefined;
      return json(200, { full_name: name, default_branch: repo.defaultBranch, permissions });
    }
    const ref = rest.match(/^\/git\/ref\/heads\/(.+)$/);
    if (ref && method === "GET") {
      const s = repo.branches[ref[1]];
      return s ? json(200, { ref: `refs/heads/${ref[1]}`, object: { type: "commit", sha: s } })
        : json(404, { message: "Not Found" });
    }
    if (rest === "/git/refs" && method === "POST") {
      const branch = String(body.ref).replace(/^refs\/heads\//, "");
      if (repo.branches[branch]) return json(422, { message: "Reference already exists" });
      repo.branches[branch] = body.sha;
      repo.files[branch] = { ...(repo.files[repo.defaultBranch] ?? {}) };
      return json(201, { ref: body.ref, object: { sha: body.sha } });
    }
    const contents = rest.match(/^\/contents\/(.+)$/);
    if (contents && method === "GET") {
      const branch = url.searchParams.get("ref") ?? repo.defaultBranch;
      const text = repo.files[branch]?.[contents[1]];
      return text === undefined ? json(404, { message: "Not Found" })
        : json(200, { type: "file", encoding: "base64", sha: sha(text), content: Buffer.from(text).toString("base64") });
    }
    if (contents && method === "PUT") {
      const branch = body.branch ?? repo.defaultBranch;
      const files = (repo.files[branch] ??= {});
      const existing = files[contents[1]];
      if (existing !== undefined && body.sha !== sha(existing)) return json(409, { message: "sha mismatch" });
      files[contents[1]] = Buffer.from(body.content, "base64").toString("utf8");
      return json(existing === undefined ? 201 : 200, { content: { sha: sha(files[contents[1]]) } });
    }
    if (rest === "/pulls" && method === "POST") {
      if (repo.pulls.some((p) => p.head === body.head && !p.merged)) {
        return json(422, { message: "A pull request already exists" });
      }
      const pr: Pull = { number: repo.pulls.length + 1, head: body.head, base: body.base, merged: false, mergeSha: null };
      repo.pulls.push(pr);
      return json(201, pullJson(name, pr));
    }
    if (rest === "/pulls" && method === "GET") {
      const head = (url.searchParams.get("head") ?? "").split(":")[1];
      return json(200, repo.pulls.filter((p) => p.head === head && !p.merged).map((p) => pullJson(name, p)));
    }
    const pull = rest.match(/^\/pulls\/(\d+)$/);
    if (pull && method === "GET") {
      const pr = repo.pulls.find((p) => p.number === Number(pull[1]));
      return pr ? json(200, pullJson(name, pr)) : json(404, { message: "Not Found" });
    }
    return json(404, { message: "Not Found" });
  }) as typeof fetch;

  return gh;
}

function pullJson(repo: string, p: Pull) {
  return {
    number: p.number,
    html_url: `https://github.com/${repo}/pull/${p.number}`,
    merged: p.merged,
    merge_commit_sha: p.mergeSha,
  };
}
