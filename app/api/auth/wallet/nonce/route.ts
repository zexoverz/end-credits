// POST /api/auth/wallet/nonce: a SIWE nonce for wallet sign-in, kept in the owner cookie for 10 min.
import { handleWalletNonce } from "@/lib/auth/wallet";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleWalletNonce(req);
