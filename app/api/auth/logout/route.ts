// POST /api/auth/logout: clears the owner cookie.
import { handleLogout } from "@/lib/auth/dev";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleLogout(req);
