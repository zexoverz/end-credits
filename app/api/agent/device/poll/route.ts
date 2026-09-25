// POST /api/agent/device/poll {id, label?}: one token request; on approval the agent key, once.
import { handleDevicePoll } from "@/lib/world/device";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleDevicePoll(req);
