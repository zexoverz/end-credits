// GET/POST /api/owner/budget: the owner's budget wallet (EndCreditsBudget spend limits), stored and on chain.
import { defaultBudgetChain } from "@/lib/owner/deps";
import { handleGetBudget, handleSetBudget } from "@/lib/owner/handlers";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handleGetBudget(req, defaultBudgetChain());
export const POST = (req: Request) => handleSetBudget(req, defaultBudgetChain());
