"use client";

// The owner's approver wallet in the browser: Base Account (passkey smart wallet), loaded only when
// a button is pressed, same SDK setup as the claim page (app/npm/.../passkey.ts). Signing uses
// `eth_signTypedData_v4` with params [address, typedData], as the SDK itself calls it. A wallet not
// yet deployed signs with an ERC-6492 envelope; the server checks and unwraps it.
import { ActionNotice, useFeedback } from "@/components/product/feedback";
import { CONTROL as U } from "@/lib/copy/control-room";
import { useEffect, useState } from "react";
import type { ProviderInterface } from "@base-org/account/browser";
import { stringToHex } from "viem";
import { baseSepolia } from "viem/chains";
import { Button, ErrorBox, Mono } from "@/components/ui";
import { fill } from "@/lib/client/approve";
import { firstAccount } from "@/lib/client/claim";
import { APPROVER_COPY as C } from "@/lib/copy/approver";

/** "base": Base Account passkey wallet. "injected": a browser extension wallet (MetaMask, Rabby…). */
export type WalletKind = "base" | "injected";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

let baseProvider: ProviderInterface | null = null;

type Injected = Eip1193 & { isMetaMask?: boolean; providers?: Injected[] };

/** The browser extension wallet; MetaMask first when several extensions share window.ethereum. */
const injected = (): Eip1193 | null => {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Injected }).ethereum;
  if (!eth) return null;
  return eth.providers?.find((p) => p.isMetaMask) ?? eth;
};

export const hasInjectedWallet = () => injected() !== null;

async function walletProvider(kind: WalletKind): Promise<Eip1193> {
  if (kind === "injected") {
    const p = injected();
    if (!p) throw new Error("no browser wallet");
    return p;
  }
  if (!baseProvider) {
    const { createBaseAccountSDK } = await import("@base-org/account/browser");
    baseProvider = createBaseAccountSDK({
      appName: "End Credits",
      appChainIds: [baseSepolia.id],
    }).getProvider();
  }
  return baseProvider as unknown as Eip1193;
}

/** The wallet holding `approver`: a browser wallet that already lists it (no prompt), else Base Account. */
export async function walletKindFor(approver: string): Promise<WalletKind> {
  const p = injected();
  if (!p) return "base";
  try {
    const accounts = await p.request({ method: "eth_accounts" });
    const list = Array.isArray(accounts)
      ? accounts.map((a) => String(a).toLowerCase())
      : [];
    return list.includes(approver.toLowerCase()) ? "injected" : "base";
  } catch {
    return "base";
  }
}

/** Asks the wallet for its account; null when it returns none. */
export async function connectWallet(
  kind: WalletKind = "base",
): Promise<string | null> {
  const p = await walletProvider(kind);
  return firstAccount(await p.request({ method: "eth_requestAccounts" }));
}

const CHAIN_HEX = `0x${baseSepolia.id.toString(16)}`;

/** Browser wallets refuse typed data whose chainId is not the active chain; switch (or add) first. */
async function onBaseSepolia(p: Eip1193): Promise<void> {
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch {
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
  }
}

/** EIP-712 signature from `address` over the JSON typed data the server prepared. */
export async function signTypedData(
  address: string,
  typedData: unknown,
  kind: WalletKind = "base",
): Promise<string> {
  const p = await walletProvider(kind);
  if (kind === "injected") await onBaseSepolia(p);
  // Extension wallets take the typed data as a JSON string; the Base Account SDK takes the object.
  const payload = kind === "injected" ? JSON.stringify(typedData) : typedData;
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
    ? e.message.slice(0, 80)
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
  // Extensions exist only in the browser: detect after mount, never during the server render.
  const [browserWallet, setBrowserWallet] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBrowserWallet(hasInjectedWallet()), 0);
    return () => clearTimeout(t);
  }, []);

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
          <Button type="button" disabled={busy} onClick={() => connect("base")}>
            {busy ? C.CONNECTING : C.CONNECT}
          </Button>
          {browserWallet && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => connect("injected")}
            >
              {busy ? C.CONNECTING : C.CONNECT_BROWSER}
            </Button>
          )}
        </div>
      )}
      {busy && <ActionNotice tone="pending">{C.CONNECTING}</ActionNotice>}
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
