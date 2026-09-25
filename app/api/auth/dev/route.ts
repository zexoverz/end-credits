// POST /api/auth/dev {token}: owner dev login until World sign-in (E11). 403 when WORLD_REQUIRED=true.
import { handleDevLogin } from "@/lib/auth/dev";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleDevLogin(req);
