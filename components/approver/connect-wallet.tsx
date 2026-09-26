"use client";

// The owner's approver wallet in the browser: Base Account (passkey smart wallet), loaded only when
// a button is pressed, same SDK setup as the claim page (app/npm/.../passkey.ts). Signing uses
// `eth_signTypedData_v4` with params [address, typedData], as the SDK itself calls it. A wallet not
// yet deployed signs with an ERC-6492 envelope; the server checks and unwraps it.
import { useState } from "react";
import type { ProviderInterface } from "@base-org/account/browser";
import { baseSepolia } from "viem/chains";
import { Button, ErrorBox, Mono } from "@/components/ui";
import { fill } from "@/lib/client/approve";
import { firstAccount } from "@/lib/client/claim";
import { APPROVER_COPY as C } from "@/lib/copy/approver";

let provider: ProviderInterface | null = null;

async function walletProvider(): Promise<ProviderInterface> {
  if (!provider) {
    const { createBaseAccountSDK } = await import("@base-org/account/browser");
    provider = createBaseAccountSDK({ appName: "End Credits", appChainIds: [baseSepolia.id] }).getProvider();
  }
  return provider;
}

/** Asks the wallet for its account; null when it returns none. */
export async function connectWallet(): Promise<string | null> {
  const p = await walletProvider();
  return firstAccount(await p.request({ method: "eth_requestAccounts" }));
}

/** EIP-712 signature from `address` over the JSON typed data the server prepared. */
export async function signTypedData(address: string, typedData: unknown): Promise<string> {
  const p = await walletProvider();
  const sig = await p.request({ method: "eth_signTypedData_v4", params: [address, typedData] });
  if (typeof sig !== "string" || !sig.startsWith("0x")) throw new Error("no signature");
  return sig;
}

export const errorName = (e: unknown) =>
  e instanceof Error ? e.message.slice(0, 80) : typeof e === "string" ? e.slice(0, 80) : "error";

export function ConnectWallet({ onConnected }: { onConnected: (address: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const a = await connectWallet();
      if (!a) throw new Error("no account");
      setAddress(a);
      onConnected(a);
    } catch (e) {
      setError(fill(C.CONNECT_FAILED, { error: errorName(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {address ? (
        <span>
          {C.CONNECTED}{" "}
          <Mono>{address}</Mono>
        </span>
      ) : (
        <Button type="button" disabled={busy} onClick={connect}>
          {busy ? C.CONNECTING : C.CONNECT}
        </Button>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
