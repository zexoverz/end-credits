import { Page } from "@/components/ui";
import { DashboardView } from "../dashboard/dashboard-view";
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { outcome } = await searchParams;
  return (
    <Page>
      <DashboardView
        view="decisions"
        outcome={typeof outcome === "string" ? outcome : ""}
      />
    </Page>
  );
}
