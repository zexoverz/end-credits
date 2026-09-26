// /approve/[tipId]: the phone page for one held tip (DESIGN §12). `?result=` is World's redirect
// back from the step-up callback; it is only a hint, the server's view decides what is shown.
import { ApproveClient } from "./approve-client";

export const dynamic = "force-dynamic";

export default async function ApprovePage({ params, searchParams }: PageProps<"/approve/[tipId]">) {
  const { tipId } = await params;
  const { result } = await searchParams;
  return <ApproveClient tipId={tipId} result={typeof result === "string" ? result : null} />;
}
