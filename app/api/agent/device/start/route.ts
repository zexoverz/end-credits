// POST /api/agent/device/start: `endcredits login` asks World for a device code (DESIGN §14.4).
import { handleDeviceStart } from "@/lib/world/device";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleDeviceStart(req);
