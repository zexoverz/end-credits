// GET /api/sessions/:id: public read for the credits roll (DESIGN §6.2), polled every second.
import { z } from "zod";
import { sessionView } from "@/lib/sessions/view";

export const dynamic = "force-dynamic";

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const view = await sessionView(id);
  return view ? Response.json(view, { headers: { "cache-control": "no-store" } }) : notFound();
}
