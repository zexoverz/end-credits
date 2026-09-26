// GET /api/owner/onboarding: the owner's setup checklist, in order, with the next step to do.
import { approverOf } from "@/lib/chain/escrow";
import { handleOnboarding } from "@/lib/owner/handlers";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleOnboarding(req, { approverOf: (payer) => approverOf(payer) });
