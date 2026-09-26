// GET /api/auth/methods → {wallet, dev, world}: the sign-in options the UI should offer.
import { handleAuthMethods } from "@/lib/auth/dev";

export const dynamic = "force-dynamic";

export const GET = () => handleAuthMethods();
