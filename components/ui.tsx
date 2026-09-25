// Thin shared UI primitives for every page. The redesign restyles these in one place.
import type { ReactNode } from "react";

export type Outcome = "paid" | "capped" | "held" | "refused" | "reserved" | "dust";

const BADGE: Record<Outcome, string> = {
  paid: "bg-paid",
  capped: "bg-capped",
  held: "bg-held",
  refused: "bg-refused",
  reserved: "bg-reserved",
  dust: "bg-dust",
};

export function Badge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="rounded px-2 py-0.5 text-xs text-muted ring-1 ring-line">screening…</span>;
  const cls = BADGE[outcome as Outcome] ?? "bg-dust";
  return <span className={`${cls} rounded px-2 py-0.5 text-xs font-medium uppercase text-white`}>{outcome}</span>;
}

export function Page({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {title && <h1 className="mb-6 text-2xl font-semibold">{title}</h1>}
      {children}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      {title && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded border border-refused/40 bg-refused/10 px-3 py-2 text-sm text-refused">{children}</div>;
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40 ${className}`}
    />
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}
