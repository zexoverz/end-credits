// Signed credit receipt returned by the x402 resource after settlement (DESIGN §10).
import { verifyMessage, type Address, type Hex, type LocalAccount } from "viem";

export type ReceiptBody = {
  creditId: string;
  package: string;
  amount: string; // micro-USDC, atomic units
  payee: string;
  tx: string;
};

export type Receipt = ReceiptBody & { sig: Hex; signer: Address };

export function canonicalJson(value: Record<string, unknown>): string {
  const sorted = Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => ({ ...acc, [key]: value[key] }), {});
  return JSON.stringify(sorted);
}

function bodyOf(r: ReceiptBody): ReceiptBody {
  return { creditId: r.creditId, package: r.package, amount: r.amount, payee: r.payee, tx: r.tx };
}

export async function signReceipt(body: ReceiptBody, signer: LocalAccount): Promise<Receipt> {
  const sig = await signer.signMessage({ message: canonicalJson(bodyOf(body)) });
  return { ...bodyOf(body), sig, signer: signer.address };
}

export async function verifyReceipt(receipt: Receipt): Promise<boolean> {
  return verifyMessage({
    address: receipt.signer,
    message: canonicalJson(bodyOf(receipt)),
    signature: receipt.sig,
  });
}
