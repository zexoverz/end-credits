// GET /api/history: every decided credit, newest first (max 200), for the `/history` page.
import { creditHistory } from "@/lib/history/history";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ items: await creditHistory() }, { headers: { "cache-control": "no-store" } });
}
