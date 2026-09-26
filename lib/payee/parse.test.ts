import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFundingJson, parseNpmFunding, parseTeaYaml, parseX402Endpoint, X402_ENDPOINT_MAX } from "./parse";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("parseFundingJson (Drips)", () => {
  it("reads prettier/prettier", () => {
    expect(parseFundingJson(fixture("prettier.FUNDING.json"))).toEqual({
      address: "0x3A39F5E9BFe0a90e394982492e166C5635893141",
    });
  });

  it("reads TanStack/query", () => {
    expect(parseFundingJson(fixture("tanstack-query.FUNDING.json"))).toEqual({
      address: "0xD5371B61b35E13F2ae354BE95081aD63FB383452",
    });
  });

  it("checksums a lowercase address", () => {
    const json = JSON.stringify({
      drips: { ethereum: { ownedBy: "0xd5371b61b35e13f2ae354be95081ad63fb383452" } },
    });
    expect(parseFundingJson(json)).toEqual({
      address: "0xD5371B61b35E13F2ae354BE95081aD63FB383452",
    });
  });

  it("prefers ethereum, then falls back to another Drips network", () => {
    const both = JSON.stringify({
      drips: {
        optimism: { ownedBy: "0x3A39F5E9BFe0a90e394982492e166C5635893141" },
        ethereum: { ownedBy: "0xD5371B61b35E13F2ae354BE95081aD63FB383452" },
      },
    });
    expect(parseFundingJson(both).address).toBe("0xD5371B61b35E13F2ae354BE95081aD63FB383452");
    const other = JSON.stringify({
      drips: { filecoin: { ownedBy: "0x3A39F5E9BFe0a90e394982492e166C5635893141" } },
    });
    expect(parseFundingJson(other).address).toBe("0x3A39F5E9BFe0a90e394982492e166C5635893141");
  });

  it("an invalid address is none with PAYEE_INVALID", () => {
    const bad = (ownedBy: string) => JSON.stringify({ drips: { ethereum: { ownedBy } } });
    expect(parseFundingJson(bad("0x1234"))).toEqual({ address: null, reason: "PAYEE_INVALID" });
    // mixed case with a wrong checksum (last letter flipped)
    expect(parseFundingJson(bad("0xD5371B61b35E13F2ae354BE95081aD63FB383453"))).toEqual({
      address: null,
      reason: "PAYEE_INVALID",
    });
    expect(parseFundingJson(bad("0x0000000000000000000000000000000000000000"))).toEqual({
      address: null,
      reason: "PAYEE_INVALID",
    });
  });

  it("no drips entry or broken JSON is none without a reason", () => {
    expect(parseFundingJson(JSON.stringify({ opRetro: { projectId: "0xabc" } }))).toEqual({
      address: null,
    });
    expect(parseFundingJson("{not json")).toEqual({ address: null });
  });
});

describe("parseTeaYaml", () => {
  it("reads colinhacks/zod", () => {
    expect(parseTeaYaml(fixture("zod.tea.yaml"))).toEqual({
      address: "0xF233A42130Bcdd8b22FFB5D9593199f31C3Eeb87",
    });
  });

  it("reads ljharb/qs with its trailing comment", () => {
    expect(parseTeaYaml(fixture("qs.tea.yaml"))).toEqual({
      address: "0xcaA2C51DEC43C2ce6174F8a3cBD258BFeECFd5B6",
    });
  });

  it("quorum above 1 is none", () => {
    const yaml = fixture("zod.tea.yaml").replace("quorum: 1", "quorum: 2");
    expect(parseTeaYaml(yaml)).toEqual({ address: null });
  });

  it("an invalid owner is none with PAYEE_INVALID", () => {
    const yaml = fixture("zod.tea.yaml").replace(
      "0xF233A42130Bcdd8b22FFB5D9593199f31C3Eeb87",
      "0xnothex",
    );
    expect(parseTeaYaml(yaml)).toEqual({ address: null, reason: "PAYEE_INVALID" });
  });

  it("broken YAML or no owners is none", () => {
    expect(parseTeaYaml("codeOwners: [\n")).toEqual({ address: null });
    expect(parseTeaYaml("version: 1.0.0\nquorum: 1\n")).toEqual({ address: null });
  });
});

describe("parseNpmFunding", () => {
  it("finds an address in any funding form", () => {
    expect(
      parseNpmFunding([
        "https://github.com/sponsors/x",
        { type: "ethereum", url: "ethereum:0xd5371b61b35e13f2ae354be95081ad63fb383452" },
      ]),
    ).toEqual({ address: "0xD5371B61b35E13F2ae354BE95081aD63FB383452" });
  });

  it("no address is none", () => {
    expect(parseNpmFunding("https://github.com/sponsors/colinhacks")).toEqual({ address: null });
    expect(parseNpmFunding(undefined)).toEqual({ address: null });
  });

  it("a bad checksum is PAYEE_INVALID", () => {
    expect(parseNpmFunding("0xD5371B61b35E13F2ae354BE95081aD63FB383453")).toEqual({
      address: null,
      reason: "PAYEE_INVALID",
    });
  });
});

describe("parseX402Endpoint (our FUNDING.json extension)", () => {
  const funding = (x402: unknown) =>
    JSON.stringify({ drips: { ethereum: { ownedBy: "0xD5371B61b35E13F2ae354BE95081aD63FB383452" } }, x402 });

  it("reads a top-level x402.endpoint", () => {
    expect(parseX402Endpoint(funding({ endpoint: "https://tips.example.com/tip" }))).toBe(
      "https://tips.example.com/tip",
    );
  });

  it("refuses anything but https", () => {
    expect(parseX402Endpoint(funding({ endpoint: "http://tips.example.com/tip" }))).toBeNull();
    expect(parseX402Endpoint(funding({ endpoint: "file:///etc/passwd" }))).toBeNull();
  });

  it("refuses credentials, fragments and junk", () => {
    expect(parseX402Endpoint(funding({ endpoint: "https://u:p@tips.example.com/" }))).toBeNull();
    expect(parseX402Endpoint(funding({ endpoint: "https://tips.example.com/#x" }))).toBeNull();
    expect(parseX402Endpoint(funding({ endpoint: "not a url" }))).toBeNull();
    expect(parseX402Endpoint(funding({ endpoint: 42 }))).toBeNull();
    expect(parseX402Endpoint(funding("https://tips.example.com/"))).toBeNull();
  });

  it("caps the length at 2048 chars", () => {
    const base = "https://tips.example.com/";
    const at = base + "a".repeat(X402_ENDPOINT_MAX - base.length);
    expect(parseX402Endpoint(funding({ endpoint: at }))).toBe(at);
    expect(parseX402Endpoint(funding({ endpoint: at + "a" }))).toBeNull();
  });

  it("is null without the key or on broken JSON", () => {
    expect(parseX402Endpoint(funding(undefined))).toBeNull();
    expect(parseX402Endpoint("{")).toBeNull();
  });
});
