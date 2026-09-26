import { afterEach, expect, it, vi } from "vitest";
import {
  connectWallet,
  hasInjectedWallet,
  onBaseSepolia,
  signTypedData,
} from "./connect-wallet";
import { APPROVER_COPY as C } from "@/lib/copy/approver";
import { fill } from "@/lib/client/approve";
const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
afterEach(() => vi.unstubAllGlobals());
it("requires MetaMask and never falls back to another injected wallet", async () => {
  const request = vi.fn();
  vi.stubGlobal("window", { ethereum: { request } });
  expect(hasInjectedWallet()).toBe(false);
  await expect(connectWallet()).rejects.toThrow(C.MISSING_METAMASK);
  expect(request).not.toHaveBeenCalled();
});
it("selects MetaMask from multiple providers and returns its selected account", async () => {
  const otherRequest = vi.fn();
  const request = vi.fn().mockResolvedValue([address, other]);
  vi.stubGlobal("window", {
    ethereum: {
      request: otherRequest,
      providers: [{ request: otherRequest }, { isMetaMask: true, request }],
    },
  });
  expect(await connectWallet()).toBe(address);
  expect(request).toHaveBeenCalledExactlyOnceWith({
    method: "eth_requestAccounts",
  });
  expect(otherRequest).not.toHaveBeenCalled();
});
it("refuses an account change before signing with the required and selected addresses", async () => {
  const request = vi.fn(async ({ method }) =>
    method === "eth_accounts" ? [other] : null,
  );
  vi.stubGlobal("window", { ethereum: { isMetaMask: true, request } });
  await expect(signTypedData(address, {})).rejects.toThrow(
    fill(C.WRONG_WALLET, { approver: address, address: other }),
  );
  expect(
    request.mock.calls.some(([r]) => r.method === "eth_signTypedData_v4"),
  ).toBe(false);
});
it("switches before sending JSON typed data to MetaMask", async () => {
  const request = vi.fn(async ({ method }) =>
    method === "eth_accounts"
      ? [address]
      : method === "eth_signTypedData_v4"
        ? "0x1234"
        : null,
  );
  vi.stubGlobal("window", { ethereum: { isMetaMask: true, request } });
  const data = { domain: { chainId: 84532 } };
  expect(await signTypedData(address, data)).toBe("0x1234");
  expect(request.mock.calls.map(([r]) => r.method)).toEqual([
    "wallet_switchEthereumChain",
    "eth_accounts",
    "eth_signTypedData_v4",
  ]);
  expect(request).toHaveBeenLastCalledWith({
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(data)],
  });
});
it("does not add a network or sign after a rejected chain switch", async () => {
  const rejection = { code: 4001 };
  const request = vi.fn().mockRejectedValue(rejection);
  vi.stubGlobal("window", { ethereum: { isMetaMask: true, request } });
  await expect(signTypedData(address, {})).rejects.toBe(rejection);
  expect(request).toHaveBeenCalledExactlyOnceWith({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x14a34" }],
  });
});
it("adds an unknown chain then explicitly switches to Base Sepolia", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce({ code: 4902 })
    .mockResolvedValue(null);
  await onBaseSepolia({ request });
  expect(request.mock.calls.map(([r]) => r.method)).toEqual([
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
  ]);
  expect(request.mock.calls[1][0].params[0].chainId).toBe("0x14a34");
});
