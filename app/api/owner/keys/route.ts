// GET/POST /api/owner/keys: list agent keys; create one (the token is in the response only once).
import { handleCreateKey, handleListKeys } from "@/lib/owner/handlers";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleListKeys(req);
export const POST = (req: Request) => handleCreateKey(req);
