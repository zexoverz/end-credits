// GET /api/auth/world/start: owner sign-in with World ID (DESIGN §14.1).
import { handleSignInStart } from "@/lib/world/oidc";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleSignInStart(req);
