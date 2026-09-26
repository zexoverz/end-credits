// POST /api/auth/wallet {message, signature}: owner sign-in with the owner's wallet (SIWE).
import { handleWalletLogin } from "@/lib/auth/wallet";
import { defaultWalletDeps } from "@/lib/auth/wallet-deps";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleWalletLogin(req, defaultWalletDeps());
