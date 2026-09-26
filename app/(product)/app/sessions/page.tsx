import { Suspense } from "react";
import { Page } from "@/components/ui";
import { DashboardView } from "../../dashboard/dashboard-view";
export default function SessionsPage() {
  return (
    <Page>
      <Suspense fallback={null}>
        <DashboardView view="sessions" />
      </Suspense>
    </Page>
  );
}
