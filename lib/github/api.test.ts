import { describe, expect, it } from "vitest";
import { fakeGitHub } from "./__fixtures__/fake-github";
import { createGitHub, GitHubError } from "./api";

describe("GitHub client", () => {
  it("reads repo permissions and the default branch with the user token", async () => {
    const gh = fakeGitHub();
    gh.addRepo("acme/lib", { defaultBranch: "trunk", perms: { tok: { admin: false, push: true, pull: true } } });
    const repo = await createGitHub({ token: "tok", fetch: gh.fetch }).repo("acme/lib");
    expect(repo).toEqual({
      fullName: "acme/lib",
      defaultBranch: "trunk",
      permissions: { admin: false, push: true, pull: true },
    });
    expect(gh.calls[0]).toMatchObject({ method: "GET", path: "/repos/acme/lib", token: "tok" });
  });

  it("returns null for a missing file and decodes a present one", async () => {
    const gh = fakeGitHub();
    gh.addRepo("acme/lib", { files: { main: { "FUNDING.json": '{"a":1}\n' } } });
    const api = createGitHub({ fetch: gh.fetch });
    expect(await api.file("acme/lib", "tea.yaml", "main")).toBeNull();
    expect((await api.file("acme/lib", "FUNDING.json", "main"))?.text).toBe('{"a":1}\n');
  });

  it("throws GitHubError with the status and never the token", async () => {
    const gh = fakeGitHub();
    gh.addRepo("acme/lib");
    gh.fail["POST /repos/acme/lib/git/refs"] = 403;
    const err = await createGitHub({ token: "gho_secret", fetch: gh.fetch })
      .createBranch("acme/lib", "x", "abc")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(403);
    expect(String(err.message)).not.toContain("gho_secret");
  });
});
