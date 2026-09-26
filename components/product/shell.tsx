"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EXPERIENCE as C } from "@/lib/copy/experience";
import { STUDIO as S } from "@/lib/copy/studio";
import { DESK as D } from "@/lib/copy/desk";
import { SetupGuide } from "./setup-guide";
import { BrandMark } from "@/components/landing/artwork";

export function ProductShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const controls = /\/(owner|approve)(\/|$)/.test(path);
  const main = [
    "/app",
    "/dashboard",
    "/app/sessions",
    "/app/history",
    "/history",
  ].includes(path);
  return (
    <div className="product-shell desk-shell">
      <a className="product-skip" href="#workspace-content">
        {C.skip}
      </a>
      <header className="desk-masthead">
        <Link href="/landing" className="product-brand">
          <BrandMark />
          {C.name}
        </Link>
        <nav className="desk-primary-nav" aria-label={D.navigation}>
          <Link href="/app" aria-current={!controls ? "page" : undefined}>
            <span>01</span>
            {D.activity}
          </Link>
          <Link href="/app/owner" aria-current={controls ? "page" : undefined}>
            <span>02</span>
            {D.controls}
          </Link>
        </nav>
        <div className="desk-utilities">
          <Link href="/app/packages" className="desk-package-link">
            {D.packages}
            <span aria-hidden="true">↗</span>
          </Link>
          <SetupGuide compact />
        </div>
      </header>
      <div className="desk-context">
        <span>
          <i />
          {S.workspaceNote}
        </span>
        {!main && !controls ? (
          <Link href="/app">← {D.back}</Link>
        ) : (
          <Link href="/landing">{S.about} ↗</Link>
        )}
      </div>
      <div className="product-workspace">
        <main id="workspace-content">{children}</main>
      </div>
    </div>
  );
}
