// verifyIdToken: one test per check (DESIGN §14.3). Each bad token differs from a good one in one
// claim only, so deleting that check makes its test pass the token and fail.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { goodClaims, ISSUER, startIdp, worldEnv, type Idp } from "./__fixtures__/idp";
import { verifyIdToken, WorldTokenError } from "./verify";

let idp: Idp;

beforeAll(async () => {
  worldEnv();
  idp = await startIdp();
});
afterAll(() => idp.close());

const verify = (token: string, expectedNonce?: string) =>
  verifyIdToken(token, { expectedNonce, jwks: idp.jwks });

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof WorldTokenError) return e.code;
    throw e;
  }
  return "passed";
}

describe("verifyIdToken", () => {
  it("accepts a good token and returns iss, sub, auth_time, acr, amr", async () => {
    const claims = goodClaims({ nonce: "n1" });
    const r = await verify(await idp.sign(claims), "n1");
    expect(r).toEqual({
      iss: ISSUER,
      sub: claims.sub,
      authTime: claims.auth_time,
      acr: claims.acr,
      amr: ["pop"],
    });
  });

  it("SIG: a token signed by another key", async () => {
    const token = await idp.sign(goodClaims(), { key: idp.otherKey });
    expect(await codeOf(verify(token))).toBe("SIG");
  });

  it("SIG: a tampered payload", async () => {
    const [h, , s] = (await idp.sign(goodClaims())).split(".");
    const forged = Buffer.from(JSON.stringify(goodClaims({ sub: "someone-else" }))).toString("base64url");
    expect(await codeOf(verify(`${h}.${forged}.${s}`))).toBe("SIG");
  });

  it("ISS: another issuer", async () => {
    const token = await idp.sign(goodClaims({ iss: "https://sandbox.auth.world.org" }));
    expect(await codeOf(verify(token))).toBe("ISS");
  });

  it("AUD: another client id", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ aud: "app_other" }))))).toBe("AUD");
  });

  it("AUD: an array audience with another client in it", async () => {
    const token = await idp.sign(goodClaims({ aud: [process.env.WORLD_CLIENT_ID, "app_other"] }));
    expect(await codeOf(verify(token))).toBe("AUD");
  });

  it("EXP: expired beyond the 30 s skew", async () => {
    const exp = Math.floor(Date.now() / 1000) - 31;
    expect(await codeOf(verify(await idp.sign(goodClaims({ exp }))))).toBe("EXP");
  });

  it("EXP: within the 30 s skew still passes", async () => {
    const exp = Math.floor(Date.now() / 1000) - 25;
    expect(await codeOf(verify(await idp.sign(goodClaims({ exp }))))).toBe("passed");
  });

  it("EXP: missing exp", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ exp: undefined }))))).toBe("EXP");
  });

  it("NONCE: another nonce", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ nonce: "other" })), "mine"))).toBe("NONCE");
  });

  it("NONCE: missing nonce when one is expected", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims()), "mine"))).toBe("NONCE");
  });

  it("no expected nonce (device grant): a token without nonce passes", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims())))).toBe("passed");
  });

  it("ACR: missing acr", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ acr: undefined }))))).toBe("ACR");
  });

  it("ACR: another acr", async () => {
    const token = await idp.sign(goodClaims({ acr: "https://world.org/oidc/acr/device" }));
    expect(await codeOf(verify(token))).toBe("ACR");
  });

  it("AMR: no pop", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ amr: ["pwd"] }))))).toBe("AMR");
  });

  it("AMR: missing amr", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ amr: undefined }))))).toBe("AMR");
  });

  it("SUB: missing sub", async () => {
    expect(await codeOf(verify(await idp.sign(goodClaims({ sub: undefined }))))).toBe("SUB");
  });
});
