import { STUDIO as S } from "@/lib/copy/studio";
/** External session links are converted to a local route; never navigate to the supplied host. */
export function sessionDestination(
  value: string,
): { href: string } | { error: string } {
  const raw = value.trim();
  let candidate = raw;
  try {
    const url = new URL(raw);
    candidate =
      url.pathname.match(/\/(?:app\/)?credits\/([^/]+)\/?$/)?.[1] ?? "";
  } catch {
    // A bare UUID is also accepted.
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      candidate,
    )
  )
    return { error: S.sessionInvalid };
  return { href: `/app/credits/${candidate}` };
}
