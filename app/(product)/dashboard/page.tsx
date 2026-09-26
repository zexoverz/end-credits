import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { DASHBOARD as C } from "@/lib/copy/dashboard";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: `${C.TITLE} · End Credits` };

export default function DashboardPage() {
  return (
    <Page title={C.TITLE}>
      <DashboardView />
    </Page>
  );
}
