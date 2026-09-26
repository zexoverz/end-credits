// /npm/<name>: the maintainer claim page (T10.5). The server part only reads the params; the page
// itself is a client component because the passkey wallet runs in the browser.
import { notFound } from "next/navigation";
import { packageNameFrom } from "@/lib/client/claim";
import { ClaimPage } from "./claim-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ name: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const name = packageNameFrom((await params).name);
  if (!name) notFound();
  const { github } = await searchParams;
  return (
    <ClaimPage
      key={name}
      name={name}
      githubCancelled={github === "cancelled"}
    />
  );
}
