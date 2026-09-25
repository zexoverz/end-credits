// GET /api/auth/world/callback: World's redirect after sign-in (DESIGN §14.1).
import { handleSignInCallback } from "@/lib/world/oidc";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleSignInCallback(req);
