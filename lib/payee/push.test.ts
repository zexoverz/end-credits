import { describe, expect, it } from "vitest";
import { memoryStore } from "./__fixtures__/memory-store";
import { CHANGE_WINDOW_DAYS, recentlyChanged } from "./change";
import { firstSeenPush } from "./push";

const API = "https://api.github.com/repos/o/r";
const SHA = "c4d29f35ac".padEnd(40, "0");
const since = new Date("2026-08-27T00:00:00Z");

type Route = Record<string, unknown>;

function fakeFetch(routes: Route, seen: { url: string; init?: RequestInit }[] = []) {
  return (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    if (!(url in routes)) return new Response("Not Found", { status: 404 });
    return new Response(JSON.stringify(routes[url]));
  }) as typeof fetch;
}

const base: Route = {
  [API]: { default_branch: "main" },
  [`${API}/commits?path=FUNDING.json&sha=main&per_page=1`]: [{ sha: SHA }],
};

const push = (timestamp: string, before: string, after: string, type = "push") => ({
  timestamp,
  before,
  after,
  activity_type: type,
  ref: "refs/heads/main",
});

describe("firstSeenPush", () => {
  it("returns the server time of the push whose head is the file's commit", async () => {
    const f = fakeFetch({
      ...base,
      [`${API}/activity?ref=main&per_page=100`]: [
        push("2026-09-20T00:00:00Z", SHA, "b".repeat(40)),
        push("2026-09-12T06:00:09Z", "a".repeat(40), SHA, "force_push"),
      ],
    });
    expect(await firstSeenPush("o/r", "FUNDING.json", { since, fetch: f })).toEqual(
      new Date("2026-09-12T06:00:09Z"),
    );
  });

  it("finds a commit inside a multi-commit push through the compare API", async () => {
    const [a, b, c] = ["a", "b", "c"].map((x) => x.repeat(40));
    const f = fakeFetch({
      ...base,
      [`${API}/activity?ref=main&per_page=100`]: [
        push("2026-09-20T00:00:00Z", b, c),
        push("2026-09-10T00:00:00Z", a, b),
      ],
      [`${API}/compare/${a}...${b}`]: { commits: [{ sha: SHA }, { sha: b }] },
      [`${API}/compare/${b}...${c}`]: { commits: [{ sha: c }] },
    });
    expect(await firstSeenPush("o/r", "FUNDING.json", { since, fetch: f })).toEqual(
      new Date("2026-09-10T00:00:00Z"),
    );
  });

  it("is null when no push inside the window carries the commit", async () => {
    const f = fakeFetch({
      ...base,
      [`${API}/activity?ref=main&per_page=100`]: [
        push("2026-09-20T00:00:00Z", "a".repeat(40), "b".repeat(40)),
        push("2026-08-01T00:00:00Z", "c".repeat(40), SHA),
      ],
      [`${API}/compare/${"a".repeat(40)}...${"b".repeat(40)}`]: { commits: [] },
    });
    expect(await firstSeenPush("o/r", "FUNDING.json", { since, fetch: f })).toBeNull();
  });

  it("is null when the file has no commit", async () => {
    const f = fakeFetch({ [API]: { default_branch: "main" } });
    expect(await firstSeenPush("o/r", "FUNDING.json", { since, fetch: f })).toBeNull();
  });

  it("follows the Link header to the next page", async () => {
    const next = `${API}/activity?ref=main&per_page=100&after=cursor1`;
    const f = (async (url: string) => {
      if (url === `${API}/activity?ref=main&per_page=100`)
        return new Response(JSON.stringify([push("2026-09-20T00:00:00Z", SHA, "b".repeat(40))]), {
          headers: { link: `<${next}>; rel="next"` },
        });
      if (url === next)
        return new Response(JSON.stringify([push("2026-09-01T00:00:00Z", "a".repeat(40), SHA)]));
      if (url in base) return new Response(JSON.stringify(base[url]));
      return new Response("", { status: 404 });
    }) as typeof fetch;
    expect(await firstSeenPush("o/r", "FUNDING.json", { since, fetch: f })).toEqual(
      new Date("2026-09-01T00:00:00Z"),
    );
  });

  it("sends the read token as a bearer", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await firstSeenPush("o/r", "FUNDING.json", {
      since,
      fetch: fakeFetch(base, seen),
      githubToken: "t0k",
    });
    expect(new Headers(seen[0].init?.headers).get("authorization")).toBe("Bearer t0k");
  });
});

describe.skipIf(!process.env.LIVE)("firstSeenPush (live GitHub Activity API)", () => {
  const githubToken = process.env.GITHUB_TOKEN_READ;

  it("ljharb/qs tea.yaml reached main in a force push, not at its commit date", async () => {
    const t = await firstSeenPush("ljharb/qs", "tea.yaml", {
      since: new Date("2024-03-01T00:00:00Z"),
      githubToken,
    });
    // commit date is 2024-03-19T19:51:35Z; the server push time is later
    expect(t).toEqual(new Date("2024-03-19T23:39:26Z"));
  });

  it("prettier/prettier FUNDING.json arrived by PR merge", async () => {
    const t = await firstSeenPush("prettier/prettier", "FUNDING.json", {
      since: new Date("2024-04-01T00:00:00Z"),
      githubToken,
    });
    expect(t).toEqual(new Date("2024-04-04T13:55:00Z"));
  });

  it("recentlyChanged: a never-observed prettier FUNDING.json from 2024 is not a change", async () => {
    const now = new Date();
    const since = new Date(now.getTime() - CHANGE_WINDOW_DAYS * 86_400_000);
    const pushedAt = () => firstSeenPush("prettier/prettier", "FUNDING.json", { since, githubToken });
    expect(
      await recentlyChanged(memoryStore(), "p", "0x3A39F5E9BFe0a90e394982492e166C5635893141", {
        now,
        pushedAt,
      }),
    ).toEqual({ changed: false, days: 0 });
  });
});
