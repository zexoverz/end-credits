// GET /api/agent/settings: the owner's limits for the calling agent key (MCP estimate).
import { handleAgentSettings } from "@/lib/sessions/agent";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleAgentSettings(req);
