import { describe, expect, it } from "vitest";
import { checkEnv, readEnv, WEB_BOOT, WORKER_BOOT, WORLD_VARS } from "./env";

const full = (names: readonly string[]) => Object.fromEntries(names.map((n) => [n, "x"]));

describe("checkEnv", () => {
  it("passes when every boot var is present", () => {
    expect(() => checkEnv(WEB_BOOT, full(WEB_BOOT))).not.toThrow();
  });

  it("names the first missing var", () => {
    const env = full(WORKER_BOOT);
    delete env.PAYER_PRIVATE_KEY;
    expect(() => checkEnv(WORKER_BOOT, env)).toThrow("Missing required env: PAYER_PRIVATE_KEY");
  });

  it("treats an empty string as missing", () => {
    expect(() => checkEnv(WEB_BOOT, { ...full(WEB_BOOT), DATABASE_URL: "" })).toThrow(
      "Missing required env: DATABASE_URL",
    );
  });

  it("requires World vars only when WORLD_REQUIRED=true", () => {
    const env = full(WEB_BOOT);
    expect(() => checkEnv(WEB_BOOT, env)).not.toThrow();
    expect(() => checkEnv(WEB_BOOT, { ...env, WORLD_REQUIRED: "true" })).toThrow(
      `Missing required env: ${WORLD_VARS[0]}`,
    );
  });
});

describe("readEnv", () => {
  it("throws a named error at first use", () => {
    expect(() => readEnv("MULTIBAAS_URL", {})).toThrow("Missing required env: MULTIBAAS_URL");
  });
});
