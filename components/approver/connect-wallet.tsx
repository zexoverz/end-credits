"use client";

// MetaMask extension provider shared by sign-in, claims and approvals.
import { MetaMaskIcon } from "@/components/approver/metamask-icon";
import { ActionNotice, useFeedback } from "@/components/product/feedback";
import { CONTROL as U } from "@/lib/copy/control-room";
import { useState } from "react";
import { stringToHex } from "viem";
import { baseSepolia } from "viem/chains";
import { Button, ErrorBox, Mono } from "@/components/ui";
import { fill } from "@/lib/client/approve";
import { firstAccount } from "@/lib/client/claim";
import { APPROVER_COPY as C } from "@/lib/copy/approver";

export type WalletKind = "injected";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type Injected = Eip1193 & { isMetaMask?: boolean; providers?: Injected[] };

/** The browser extension wallet; MetaMask first when several extensions share window.ethereum. */
const injected = (): Eip1193 | null => {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Injected }).ethereum;
  if (!eth) return null;
  return (
    eth.providers?.find((p) => p.isMetaMask) ?? (eth.isMetaMask ? eth : null)
  );
};

export const hasInjectedWallet = () => injected() !== null;

export async function walletProvider(
  _kind: WalletKind = "injected",
): Promise<Eip1193> {
  void _kind;
  const p = injected();
  if (!p) throw new Error(C.MISSING_METAMASK);
  return p;
}

/** Asks the wallet for its account; null when it returns none. */
export async function connectWallet(
  kind: WalletKind = "injected",
): Promise<string | null> {
  const p = await walletProvider(kind);
  return firstAccount(await p.request({ method: "eth_requestAccounts" }));
}

const CHAIN_HEX = `0x${baseSepolia.id.toString(16)}`;

/** Browser wallets refuse typed data whose chainId is not the active chain; switch (or add) first. */
export async function onBaseSepolia(p: Eip1193): Promise<void> {
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: baseSepolia.name,
          nativeCurrency: baseSepolia.nativeCurrency,
          rpcUrls: baseSepolia.rpcUrls.default.http,
          blockExplorerUrls: [baseSepolia.blockExplorers.default.url],
        },
      ],
    });
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  }
}

/** EIP-712 signature from `address` over the JSON typed data the server prepared. */
export async function signTypedData(
  address: string,
  typedData: unknown,
  kind: WalletKind = "injected",
): Promise<string> {
  const p = await walletProvider(kind);
  await onBaseSepolia(p);
  const selected = firstAccount(await p.request({ method: "eth_accounts" }));
  if (selected?.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      fill(C.WRONG_WALLET, { approver: address, address: selected ?? C.NONE }),
    );
  }
  const payload = JSON.stringify(typedData);
  const sig = await p.request({
    method: "eth_signTypedData_v4",
    params: [address, payload],
  });
  if (typeof sig !== "string" || !sig.startsWith("0x"))
    throw new Error("no signature");
  return sig;
}

/** EIP-191 message signature, using the same provider as connectWallet. */
export async function signPersonalMessage(
  address: string,
  message: string,
  kind: WalletKind,
): Promise<string> {
  const p = await walletProvider(kind);
  const signature = await p.request({
    method: "personal_sign",
    params: [stringToHex(message), address],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-f]+$/i.test(signature))
    throw new Error("no_signature");
  return signature;
}

export const errorName = (e: unknown) =>
  e instanceof Error
    ? e.message.slice(0, 240)
    : typeof e === "string"
      ? e.slice(0, 80)
      : "error";

export function ConnectWallet({
  onConnected,
}: {
  onConnected: (address: string) => void;
}) {
  const notify = useFeedback();
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function connect(kind: WalletKind) {
    setBusy(true);
    setError(null);
    try {
      const a = await connectWallet(kind);
      if (!a) throw new Error("no account");
      setAddress(a);
      onConnected(a);
      notify(U.connectedTitle, U.connectedBody);
    } catch (e) {
      setError(fill(C.CONNECT_FAILED, { error: errorName(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {address ? (
        <ActionNotice>
          {C.CONNECTED} <Mono>{address}</Mono>
        </ActionNotice>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => connect("injected")}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <MetaMaskIcon />
              {busy ? C.CONNECTING : C.CONNECT}
            </span>
          </Button>
        </div>
      )}
      {busy && <ActionNotice tone="pending">{C.CONNECTING}</ActionNotice>}
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
