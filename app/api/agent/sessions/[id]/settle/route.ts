// POST /api/agent/sessions/:id/settle: the agent asks for its own session to roll (MCP server).
import { handleAgentSettle } from "@/lib/sessions/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleAgentSettle(req, (await params).id);
}
