// Landing (DESIGN §12 `/`): the one line, three steps, NOT_A_PAYWALL, the measurement, links.
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, Page } from "@/components/ui";
import { addressUrl } from "@/lib/client/format";
import { ESCROW_ADDRESS, LANDING as L, REPO_URL } from "@/lib/copy/landing";
import { MESSAGES } from "@/lib/messages";

const ext = { target: "_blank", rel: "noopener noreferrer", className: "underline" } as const;

export default function Home() {
  return (
    <Page>
      <section className="py-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">{L.NAME}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">{L.ONE_LINE}</h1>
        <p className="mt-4 text-muted">{MESSAGES.NOT_A_PAYWALL}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{L.STEPS_TITLE}</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          <Step n={1} title={L.STEP_1_TITLE}>
            <p>{L.STEP_1_BODY}</p>
          </Step>
          <Step n={2} title={L.STEP_2_TITLE}>
            <p>{L.STEP_2_BODY}</p>
          </Step>
          <Step n={3} title={L.STEP_3_TITLE}>
            <p>{L.STEP_3_BODY}</p>
            <ul className="mt-2 space-y-2">
              {L.OUTCOMES.map((o) => (
                <li key={o.outcome} className="flex items-start gap-2">
                  <Badge outcome={o.outcome} />
                  <span>{o.line}</span>
                </li>
              ))}
            </ul>
          </Step>
        </ol>
      </section>

      <section className="mt-10">
        <Card title={L.MEASURE_TITLE}>
          <div className="grid gap-4 sm:grid-cols-2">
            <p>
              <span className="text-3xl font-semibold">{L.MEASURE_ANY_VALUE}</span> {L.MEASURE_ANY}
            </p>
            <p>
              <span className="text-3xl font-semibold">{L.MEASURE_WALLET_VALUE}</span> {L.MEASURE_WALLET}
            </p>
          </div>
          <p className="mt-3 text-sm">{L.MEASURE_READING}</p>
          <p className="mt-1 text-xs text-muted">{L.MEASURE_SCOPE}</p>
        </Card>
      </section>

      <section className="mt-10">
        <Card title={L.TRY_TITLE}>
          <p className="text-sm">{L.TRY_INTRO}</p>
          <pre className="mt-2 overflow-x-auto rounded bg-film p-3 font-mono text-sm text-white">
            {L.TRY_COMMANDS.join("\n")}
          </pre>
          <p className="mt-2 text-sm">
            <Link href="/owner" className="underline">
              {L.TRY_KEY_NOTE}
            </Link>
          </p>
        </Card>
      </section>

      <section className="mt-10 mb-6">
        <h2 className="text-lg font-semibold">{L.LINKS_TITLE}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link href="/dashboard" className="underline">
              {L.LINK_DASHBOARD}
            </Link>
          </li>
          <li>
            <Link href="/history" className="underline">
              {L.LINK_HISTORY}
            </Link>
          </li>
          <li>
            <a href={REPO_URL} {...ext}>
              {L.LINK_REPO}
            </a>
          </li>
          <li>
            <a href={addressUrl(ESCROW_ADDRESS)} {...ext}>
              {L.LINK_ESCROW}
            </a>{" "}
            <span className="font-mono text-xs break-all text-muted">{ESCROW_ADDRESS}</span>
          </li>
        </ul>
      </section>
    </Page>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-lg border border-line bg-card p-4 text-sm">
      <p className="text-xs font-semibold text-muted">{n}</p>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </li>
  );
}
