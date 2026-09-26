// `/history` (T8.2): every decided credit with its reasons, screens, hold and tx.
import { STUDIO as S } from "@/lib/copy/studio";
import { Page } from "@/components/ui";
import { History } from "./history";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { outcome } = await searchParams;
  return (
    <Page title={S.decisionsTitle}>
      <History initialOutcome={typeof outcome === "string" ? outcome : ""} />
    </Page>
  );
}
