import { OutcomeMark } from "@/components/product/desk-assets";
import type { ReactNode } from "react";
import { EXPERIENCE as C } from "@/lib/copy/experience";
export type Outcome =
  | "paid"
  | "capped"
  | "held"
  | "refused"
  | "reserved"
  | "dust";
const OUTCOMES = new Set<string>(C.outcomes);
export function Badge({ outcome }: { outcome: string | null }) {
  return (
    <span
      className={`outcome-badge outcome-${outcome && OUTCOMES.has(outcome) ? outcome : "dust"}`}
    >
      <OutcomeMark outcome={outcome ?? null} />
      {outcome ?? C.screening}
    </span>
  );
}
export function Page({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="product-page">
      {title && (
        <header className="page-heading">
          <p>{C.pageEyebrow}</p>
          <h1>{title}</h1>
        </header>
      )}
      {children}
    </div>
  );
}
export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="product-card">
      {title && <h2 className="card-heading">{title}</h2>}
      {children}
    </section>
  );
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="product-error">
      {children}
    </div>
  );
}
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return <button {...rest} className={`product-button ${className}`} />;
}
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}
