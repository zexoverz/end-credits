// GET/PUT /api/owner/settings: budget, cap, daily limit (USDC strings), hold TTL, settle mode.
import { handleGetSettings, handlePutSettings } from "@/lib/owner/handlers";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleGetSettings(req);
export const PUT = (req: Request) => handlePutSettings(req);
