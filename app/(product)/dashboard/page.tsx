import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { DESK as D } from "@/lib/copy/desk";
import { DashboardView } from "./dashboard-view";
export const metadata: Metadata = { title: `${D.activity} · End Credits` };
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { view, outcome } = await searchParams;
  return (
    <Page>
      <DashboardView
        view={typeof view === "string" ? view : "sessions"}
        outcome={typeof outcome === "string" ? outcome : ""}
      />
    </Page>
  );
}
