// DELETE /api/owner/keys/:id: revoke an agent key.
import { handleRevokeKey } from "@/lib/owner/handlers";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleRevokeKey(req, id);
}
