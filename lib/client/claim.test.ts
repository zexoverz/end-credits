import { describe, expect, it } from "vitest";
import { msg } from "../messages";
import { CLAIM_COPY } from "../copy/claim";
import {
  blocker,
  claimPath,
  errorNotice,
  firstAccount,
  loginUrl,
  packageNameFrom,
  parseAddress,
  reserveLine,
  safeLinks,
  shouldPoll,
  steps,
  summaryPath,
  toneOf,
  viewNotice,
  walletErrorText,
  type ClaimView,
  type PackageSummary,
} from "./claim";

const WALLET = "0x52908400098527886E0F7030069857D2E4169EE7";

function summary(over: Partial<PackageSummary> = {}): PackageSummary {
  return {
    package: "date-fns",
    repo: "date-fns/date-fns",
    state: "reserved",
    reserved: "1.5",
    sessions: 3,
    headline: msg("CLAIM_HEADLINE", { amount: "1.5", package: "date-fns", sessions: 3 }),
    alsoAccepts: [],
    payee: null,
    alreadyPayable: null,
    cooling: null,
    maintainer: null,
    claim: null,
    payeeRisk: null,
    errors: [],
    ...over,
  };
}

function view(status: ClaimView["status"], over: Partial<ClaimView> = {}): ClaimView {
  return {
    status,
    repo: "date-fns/date-fns",
    wallet: status === "none" ? null : WALLET,
    prMode: null,
    prNumber: null,
    prUrl: null,
    claimedAmount: null,
    coolingUntil: null,
    code: null,
    message: null,
    ...over,
  };
}

const me = { login: "kossnocorp" };

describe("packageNameFrom", () => {
  it("joins a scoped name and keeps a plain one", () => {
    expect(packageNameFrom(["@tanstack", "react-query"])).toBe("@tanstack/react-query");
    expect(packageNameFrom(["%40tanstack", "react-query"])).toBe("@tanstack/react-query");
    expect(packageNameFrom(["zod"])).toBe("zod");
  });

  it("rejects shapes npm cannot have", () => {
    expect(packageNameFrom([])).toBeNull();
    expect(packageNameFrom(undefined)).toBeNull();
    expect(packageNameFrom(["a", "b"])).toBeNull();
    expect(packageNameFrom(["@scope"])).toBeNull();
    expect(packageNameFrom(["@s", "p", "x"])).toBeNull();
    expect(packageNameFrom(["%E0%A4%A"])).toBeNull();
    expect(packageNameFrom(["a%2Fb"])).toBeNull();
  });
});

describe("paths", () => {
  it("keeps the scope slash unencoded and puts the action last", () => {
    expect(summaryPath("@tanstack/react-query")).toBe("/api/npm/%40tanstack/react-query");
    expect(claimPath("@tanstack/react-query", "status")).toBe("/api/claim/%40tanstack/react-query/status");
    expect(claimPath("zod", "wallet")).toBe("/api/claim/zod/wallet");
    expect(loginUrl("@tanstack/react-query")).toBe("/api/github/login?pkg=%40tanstack%2Freact-query");
  });
});

describe("steps", () => {
  it("signed out: GitHub is next, the rest locked", () => {
    expect(steps(summary(), null)).toEqual({ github: "active", wallet: "locked", pr: "locked", merge: "locked" });
  });

  it("signed in without a claim: wallet is next", () => {
    expect(steps(summary({ maintainer: me }), null)).toEqual({
      github: "done",
      wallet: "active",
      pr: "locked",
      merge: "locked",
    });
    expect(steps(summary({ maintainer: me }), view("none")).wallet).toBe("active");
  });

  it("wallet stored: the PR is next", () => {
    expect(steps(summary({ maintainer: me }), view("wallet"))).toEqual({
      github: "done",
      wallet: "done",
      pr: "active",
      merge: "locked",
    });
  });

  it("started without a wallet keeps the wallet step open", () => {
    expect(steps(summary({ maintainer: me }), view("started", { wallet: null })).wallet).toBe("active");
  });

  it.each(["pr_open", "merged", "verified"] as const)("%s: waiting on the merge", (status) => {
    expect(steps(summary({ maintainer: me, state: "in_progress" }), view(status))).toEqual({
      github: "done",
      wallet: "done",
      pr: "done",
      merge: "active",
    });
  });

  it("claimed: all done", () => {
    expect(steps(summary({ maintainer: me, state: "claimed" }), view("claimed"))).toEqual({
      github: "done",
      wallet: "done",
      pr: "done",
      merge: "done",
    });
  });

  it("refused: the last step failed", () => {
    expect(steps(summary({ maintainer: me, state: "refused" }), view("refused")).merge).toBe("failed");
  });

  it("a claim row survives a lost session: GitHub shows as next again", () => {
    expect(steps(summary(), view("pr_open")).github).toBe("active");
  });
});

describe("blocker", () => {
  it("already payable locks every step", () => {
    const s = summary({ alreadyPayable: msg("ALREADY_PAYABLE", { package: "zod" }), payee: { address: WALLET, source: "funding_json" } });
    expect(blocker(s, null)).toBe("ALREADY_PAYABLE");
    expect(steps(s, null)).toEqual({ github: "locked", wallet: "locked", pr: "locked", merge: "locked" });
  });

  it("no repository", () => {
    expect(blocker(summary({ repo: null }), null)).toBe("NO_REPO");
  });

  it("claimed by someone else", () => {
    expect(blocker(summary({ state: "claimed", payee: { address: WALLET, source: "claim" } }), null)).toBe(
      "CLAIMED_BY_OTHER",
    );
  });

  it("the visitor's own claim is never blocked", () => {
    const s = summary({ state: "claimed", maintainer: me });
    expect(blocker(s, view("claimed"))).toBeNull();
  });

  it("an open claim is not blocked", () => {
    expect(blocker(summary({ maintainer: me }), null)).toBeNull();
  });
});

describe("shouldPoll", () => {
  it("polls only while the status can still move", () => {
    expect(shouldPoll(null)).toBe(false);
    for (const s of ["none", "started", "wallet", "claimed", "refused"] as const) expect(shouldPoll(view(s))).toBe(false);
    for (const s of ["pr_open", "merged", "verified"] as const) expect(shouldPoll(view(s))).toBe(true);
  });
});

describe("notices", () => {
  it("tones: claimed ok, refusals and mismatches error, waiting info", () => {
    expect(toneOf("CLAIMED")).toBe("ok");
    expect(toneOf("CLAIM_REFUSED")).toBe("error");
    expect(toneOf("FUNDING_MISMATCH")).toBe("error");
    expect(toneOf("NO_PERMISSION")).toBe("error");
    expect(toneOf("PR_WAITING")).toBe("info");
    expect(toneOf("SCREEN_UNAVAILABLE")).toBe("info");
    expect(toneOf("COOLING")).toBe("info");
    expect(toneOf(null)).toBe("info");
  });

  it("uses the server message when the error carries one", () => {
    const text = msg("NO_PERMISSION", { repo: "a/b", package: "b" });
    expect(errorNotice({ error: "no_permission", code: "NO_PERMISSION", message: text }, 403)).toEqual({
      tone: "error",
      text,
      code: "NO_PERMISSION",
    });
  });

  it("maps bare error codes to page copy", () => {
    expect(errorNotice({ error: "signed_out" }, 401).text).toBe(CLAIM_COPY.ERR_SIGNED_OUT);
    expect(errorNotice({ error: "github_error" }, 502).text).toBe(CLAIM_COPY.ERR_GITHUB);
    expect(errorNotice({ error: "weird" }, 500).text).toBe("Something went wrong (weird).");
    expect(errorNotice(null, 500).text).toBe("Something went wrong (HTTP 500).");
  });

  it("a view without a message has no notice", () => {
    expect(viewNotice(view("wallet"))).toBeNull();
    const text = msg("PR_WAITING", { number: 7 });
    expect(viewNotice(view("pr_open", { code: "PR_WAITING", message: text }))).toEqual({
      tone: "info",
      text,
      code: "PR_WAITING",
    });
  });
});

describe("reserveLine", () => {
  it("a failed chain read is an error, not nothing reserved", () => {
    const s = summary({ state: "nothing_reserved", reserved: null, headline: null, errors: ["chain"] });
    expect(reserveLine(s)).toEqual({ tone: "error", text: CLAIM_COPY.CHAIN_ERROR, code: "chain" });
  });

  it("shows the headline when something is reserved", () => {
    expect(reserveLine(summary()).text).toBe("Agents set aside 1.5 USDC for date-fns from 3 sessions.");
  });

  it("says nothing is reserved only after a good read", () => {
    const line = reserveLine(summary({ state: "nothing_reserved", reserved: "0", headline: null }));
    expect(line.code).toBeNull();
    expect(line.text).toContain("Nothing is reserved for date-fns");
  });
});

describe("addresses", () => {
  it("takes the first valid account, checksummed", () => {
    expect(firstAccount([WALLET.toLowerCase()])).toBe(WALLET);
    expect(firstAccount(["nope", WALLET])).toBe(WALLET);
    expect(firstAccount([])).toBeNull();
    expect(firstAccount("0x1")).toBeNull();
  });

  it("parses a typed address", () => {
    expect(parseAddress(`  ${WALLET.toLowerCase()} `)).toBe(WALLET);
    expect(parseAddress("0x123")).toBeNull();
  });

  it("names a cancelled passkey prompt", () => {
    expect(walletErrorText({ code: 4001, message: "User rejected" })).toBe(CLAIM_COPY.WALLET_REJECTED);
    expect(walletErrorText(new Error("popup blocked"))).toBe("The wallet did not return an address (popup blocked).");
  });
});

describe("safeLinks", () => {
  it("keeps only http(s) funding links", () => {
    const links = ["https://opencollective.com/x", "javascript:alert(1)", "data:text/html,x", "nope", "http://a.b"];
    expect(safeLinks(links)).toEqual(["https://opencollective.com/x", "http://a.b"]);
  });
});
