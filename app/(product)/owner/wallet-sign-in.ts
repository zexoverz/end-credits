import { getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { api } from "@/components/product/request";
import {
  connectWallet,
  signPersonalMessage,
  type WalletKind,
} from "@/components/approver/connect-wallet";
import { ONBOARDING as C } from "@/lib/copy/onboarding";
export type SignInStage = keyof typeof C.stages;
export function walletSignInError(error: unknown): string {
  const e = error as { code?: number; message?: string };
  const code =
    e?.code === 4001
      ? "rejected"
      : e?.code === -32002
        ? "pending"
        : (e?.message ?? "unknown");
  return (
    C.errors[code as keyof typeof C.errors] ??
    `${C.errors.unknown} (${code.slice(0, 100)})`
  );
}
export async function signInWithWallet(
  kind: WalletKind,
  stage: (s: SignInStage) => void,
  current: () => boolean = () => true,
) {
  stage("nonce");
  const nonce = await api<{ nonce: string }>("/api/auth/wallet/nonce", {
    method: "POST",
  });
  if (!current()) return false;
  if (!nonce.ok) throw new Error(nonce.status === 0 ? "network" : nonce.error);
  stage("connect");
  const address = await connectWallet(kind);
  if (!current()) return false;
  if (!address) throw new Error("no_account");
  const message = createSiweMessage({
    domain: window.location.host,
    address: getAddress(address),
    statement: C.statement,
    uri: window.location.origin,
    version: "1",
    chainId: 84532,
    nonce: nonce.data.nonce,
  });
  stage("sign");
  const signature = await signPersonalMessage(address, message, kind);
  if (!current()) return false;
  stage("verify");
  const result = await api<{ ownerId: string; wallet: string }>(
    "/api/auth/wallet",
    { method: "POST", body: JSON.stringify({ message, signature }) },
  );
  if (!current()) return false;
  if (!result.ok)
    throw new Error(result.status === 0 ? "network" : result.error);
  return true;
}
