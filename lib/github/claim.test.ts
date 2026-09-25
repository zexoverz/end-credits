import { describe, expect, it } from "vitest";
import { fakeGitHub } from "./__fixtures__/fake-github";
import { createGitHub } from "./api";
import { CLAIM_BRANCH, fundingJson, newFileUrl, openFundingPr, readFunding } from "./claim";

const WALLET = "0x1111111111111111111111111111111111111111" as const;

function setup() {
  const gh = fakeGitHub();
  gh.addRepo("acme/lib", { perms: { tok: { admin: false, push: true, pull: true } } });
  return { gh, api: createGitHub({ token: "tok", fetch: gh.fetch }) };
}

describe("openFundingPr", () => {
  it("opens one PR adding FUNDING.json on its own branch, and a retry reuses it", async () => {
    const { gh, api } = setup();
    const first = await openFundingPr(api, "acme/lib", WALLET);
    expect(first).toEqual({ mode: "api", base: "main", number: 1, url: "https://github.com/acme/lib/pull/1" });
    expect(gh.repos["acme/lib"].files[CLAIM_BRANCH]["FUNDING.json"]).toBe(
      `{"drips":{"ethereum":{"ownedBy":"${WALLET}"}}}\n`,
    );
    expect(await openFundingPr(api, "acme/lib", WALLET)).toEqual(first);
    expect(gh.repos["acme/lib"].pulls).toHaveLength(1);
  });

  it("falls back to the new-file link on a 403", async () => {
    const { gh, api } = setup();
    gh.fail["POST /repos/acme/lib/git/refs"] = 403;
    const r = await openFundingPr(api, "acme/lib", WALLET);
    expect(r).toEqual({ mode: "new_file_link", base: "main", url: newFileUrl("acme/lib", "main", WALLET) });
    const url = new URL(r.url);
    expect(url.pathname).toBe("/acme/lib/new/main");
    expect(url.searchParams.get("filename")).toBe("FUNDING.json");
    expect(url.searchParams.get("value")).toBe(fundingJson(WALLET));
  });

  it("does not hide other GitHub errors behind the link", async () => {
    const { gh, api } = setup();
    gh.fail["POST /repos/acme/lib/pulls"] = 500;
    await expect(openFundingPr(api, "acme/lib", WALLET)).rejects.toThrow("GitHub 500");
  });
});

describe("readFunding", () => {
  it("reads and checksums ownedBy", async () => {
    const { gh, api } = setup();
    gh.repos["acme/lib"].files.main["FUNDING.json"] = fundingJson(WALLET.toLowerCase() as typeof WALLET);
    const r = await readFunding(api, "acme/lib", "main");
    expect(r).toMatchObject({ present: true, address: WALLET });
    expect(await readFunding(api, "acme/lib", "nope")).toEqual({ present: false });
  });
});
