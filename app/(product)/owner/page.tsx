// /owner (DESIGN §12). `?world=<CODE>` is a failed World sign-in from /api/auth/world/callback.
import { getOwnerSession } from "@/lib/auth/owner";
import { OwnerClient } from "./owner-client";

export const dynamic = "force-dynamic";

export default async function OwnerPage({ searchParams }: PageProps<"/owner">) {
  const [{ world, section }, session] = await Promise.all([
    searchParams,
    getOwnerSession(),
  ]);
  return (
    <OwnerClient
      initialSignedIn={!!session}
      initialSection={typeof section === "string" ? section : "budget"}
      worldCode={typeof world === "string" ? world : null}
    />
  );
}
