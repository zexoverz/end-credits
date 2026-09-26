import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { parseSiweMessage } from "viem/siwe";
import { ONBOARDING as C } from "@/lib/copy/onboarding";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  connect: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/components/product/request", () => ({ api: mocks.api }));
vi.mock("@/components/approver/connect-wallet", () => ({
  connectWallet: mocks.connect,
  signPersonalMessage: mocks.sign,
}));
import { signInWithWallet, walletSignInError } from "./wallet-sign-in";
const address = `0x${"1".repeat(40)}`;
const signature = `0x${"a".repeat(130)}`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    location: {
      host: "end-credits.up.railway.app",
      origin: "https://end-credits.up.railway.app",
    },
  });
  mocks.api
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { nonce: "freshNonce123" },
    })
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: { ownerId: "owner", wallet: address },
    });
  mocks.connect.mockResolvedValue(address);
  mocks.sign.mockResolvedValue(signature);
});
afterEach(() => vi.unstubAllGlobals());
describe("owner wallet sign-in", () => {
  it.each(["base", "injected"] as const)(
    "signs a fresh SIWE message and submits the same message with %s",
    async (kind) => {
      const stage = vi.fn();
      expect(await signInWithWallet(kind, stage)).toBe(true);
      expect(mocks.api.mock.calls[0][0]).toBe("/api/auth/wallet/nonce");
      expect(stage.mock.calls.flat()).toEqual([
        "nonce",
        "connect",
        "sign",
        "verify",
      ]);
      const body = JSON.parse(mocks.api.mock.calls[1][1].body);
      expect(parseSiweMessage(body.message)).toMatchObject({
        address,
        domain: "end-credits.up.railway.app",
        uri: "https://end-credits.up.railway.app",
        chainId: 84532,
        nonce: "freshNonce123",
        version: "1",
        statement: C.statement,
      });
      expect(body.signature).toBe(signature);
      expect(mocks.sign).toHaveBeenCalledWith(address, body.message, kind);
    },
  );
  it("does not ask for a signature after nonce failure", async () => {
    mocks.api
      .mockReset()
      .mockResolvedValue({ ok: false, status: 0, error: "fetch failed" });
    await expect(signInWithWallet("injected", vi.fn())).rejects.toThrow(
      "network",
    );
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("does not open a wallet after cancelling the nonce request", async () => {
    const stage = vi.fn();
    expect(await signInWithWallet("injected", stage, () => false)).toBe(false);
    expect(stage.mock.calls.flat()).toEqual(["nonce"]);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("does not sign after cancelling account selection", async () => {
    let current = true;
    mocks.connect.mockImplementation(async () => {
      current = false;
      return address;
    });
    expect(await signInWithWallet("injected", vi.fn(), () => current)).toBe(
      false,
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("ignores a completed request after the view was unmounted", async () => {
    let current = true;
    mocks.api
      .mockReset()
      .mockResolvedValueOnce({ ok: true, data: { nonce: "freshNonce123" } })
      .mockImplementationOnce(async () => {
        current = false;
        return { ok: true, data: { ownerId: "owner" } };
      });
    expect(await signInWithWallet("injected", vi.fn(), () => current)).toBe(
      false,
    );
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("does not submit a cancelled wallet prompt", async () => {
    let current = true;
    mocks.sign.mockImplementation(async () => {
      current = false;
      return signature;
    });
    expect(await signInWithWallet("injected", vi.fn(), () => current)).toBe(
      false,
    );
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("does not submit when the wallet returns no account", async () => {
    mocks.connect.mockResolvedValue(null);
    await expect(signInWithWallet("injected", vi.fn())).rejects.toThrow(
      "no_account",
    );
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("does not turn a rejected signature into a login", async () => {
    mocks.sign.mockRejectedValue({ code: 4001 });
    await expect(signInWithWallet("injected", vi.fn())).rejects.toEqual({
      code: 4001,
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(walletSignInError({ code: 4001 })).toBe(C.errors.rejected);
  });
  it.each([
    "invalid_body",
    "bad_nonce",
    "bad_domain",
    "bad_signature",
    "expired",
    "wrong_wallet",
    "no_owner",
    "chain_error",
  ] as const)("keeps the server's %s failure distinct", async (error) => {
    mocks.api
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { nonce: "freshNonce123" },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        error,
        body: { error },
      });
    await expect(signInWithWallet("base", vi.fn())).rejects.toThrow(error);
    expect(walletSignInError(new Error(error))).toBe(C.errors[error]);
  });
});
