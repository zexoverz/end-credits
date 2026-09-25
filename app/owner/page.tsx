// /owner (DESIGN §12). `?world=<CODE>` is a failed World sign-in from /api/auth/world/callback.
import { OwnerClient } from "./owner-client";

export const dynamic = "force-dynamic";

export default async function OwnerPage({ searchParams }: PageProps<"/owner">) {
  const { world } = await searchParams;
  return <OwnerClient worldCode={typeof world === "string" ? world : null} />;
}
