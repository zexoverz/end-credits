import { Suspense } from "react";
import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { DESK as D } from "@/lib/copy/desk";
import { DashboardView } from "./dashboard-view";
export const metadata: Metadata = { title: `${D.activity} · End Credits` };
export default function DashboardPage() {
  return (
    <Page>
      <Suspense fallback={null}>
        <DashboardView />
      </Suspense>
    </Page>
  );
}
