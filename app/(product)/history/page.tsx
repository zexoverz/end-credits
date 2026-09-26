// `/history` (T8.2): every decided credit with its reasons, screens, hold and tx.
import { Page } from "@/components/ui";
import { HISTORY_COPY } from "@/lib/copy/history";
import { History } from "./history";

export default function HistoryPage() {
  return (
    <Page title={HISTORY_COPY.TITLE}>
      <History />
    </Page>
  );
}
