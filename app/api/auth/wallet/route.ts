// POST /api/auth/wallet {message, signature}: owner sign-in with the owner's wallet (SIWE).
import { handleWalletLogin } from "@/lib/auth/wallet";
import { defaultWalletDeps } from "@/lib/auth/wallet-deps";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    return await handleWalletLogin(req, defaultWalletDeps());
  } catch (e) {
    // Sign-in reads the chain (signature check, approver on first bind). Without the chain config
    // that throws, and a bare 500 hides why. Name the missing variable, never its value.
    if (e instanceof Error && e.message.startsWith("Missing required env")) {
      return Response.json({ error: "chain_unavailable", detail: e.message }, { status: 503 });
    }
    throw e;
  }
}
