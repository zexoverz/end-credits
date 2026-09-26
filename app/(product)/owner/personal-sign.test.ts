import { afterEach, expect, it, vi } from "vitest";
import { stringToHex } from "viem";
import { signPersonalMessage } from "@/components/approver/connect-wallet";
afterEach(() => vi.unstubAllGlobals());
it("sends the exact SIWE message as UTF-8 hex to personal_sign without a transaction", async () => {
  const request = vi.fn().mockResolvedValue("0x1234");
  vi.stubGlobal("window", { ethereum: { request } });
  expect(
    await signPersonalMessage(
      "0x1111111111111111111111111111111111111111",
      "Sign in to End Credits",
      "injected",
    ),
  ).toBe("0x1234");
  expect(request).toHaveBeenCalledExactlyOnceWith({
    method: "personal_sign",
    params: [
      stringToHex("Sign in to End Credits"),
      "0x1111111111111111111111111111111111111111",
    ],
  });
});
it("rejects a non-hex wallet signature", async () => {
  vi.stubGlobal("window", {
    ethereum: { request: vi.fn().mockResolvedValue("invalid") },
  });
  await expect(
    signPersonalMessage(
      "0x1111111111111111111111111111111111111111",
      "message",
      "injected",
    ),
  ).rejects.toThrow("no_signature");
});
