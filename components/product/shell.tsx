"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EXPERIENCE as C } from "@/lib/copy/experience";
import { STUDIO as S } from "@/lib/copy/studio";
import { SetupGuide } from "./setup-guide";
import { BrandMark } from "@/components/landing/artwork";

function NavIcon({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {index === 0 ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ) : index === 1 ? (
        <>
          <path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      ) : index === 2 ? (
        <>
          <path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10L3 7m9 5 9-5M12 12v10M7 4.5l9 5" />
        </>
      ) : (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" fill="currentColor" />
          <circle cx="15" cy="12" r="2" fill="currentColor" />
          <circle cx="8" cy="18" r="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
export function ProductShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const canonical = path.startsWith("/app")
    ? path
    : path === "/dashboard"
      ? "/app"
      : `/app${path}`;
  return (
    <div className="product-shell">
      <a className="product-skip" href="#workspace-content">
        {C.skip}
      </a>
      <aside className="product-sidebar">
        <Link href="/landing" className="product-brand">
          <BrandMark />
          {C.name}
        </Link>
        <p className="sidebar-label">{S.workspace}</p>
        <nav aria-label={C.nav}>
          {S.nav.map(([href, label], index) => {
            const selected =
              href === "/app"
                ? canonical === href
                : canonical.startsWith(href) ||
                  (href === "/app/sessions" &&
                    canonical.startsWith("/app/credits")) ||
                  (href === "/app/owner" &&
                    canonical.startsWith("/app/approve")) ||
                  (href === "/app/packages" &&
                    canonical.startsWith("/app/npm"));
            return (
              <Link
                key={href}
                href={href}
                aria-current={selected ? "page" : undefined}
              >
                <NavIcon
                  index={
                    index === 1
                      ? 1
                      : index === 2
                        ? 2
                        : index === 3
                          ? 1
                          : index === 4
                            ? 3
                            : 0
                  }
                />
                <span>{label}</span>
                {selected && <span className="nav-indicator" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-version">
            <i />
            {S.workspaceNote}
          </div>
          <Link className="sidebar-about" href="/landing">
            {S.about}
            <span>↗</span>
          </Link>
        </div>
      </aside>
      <div className="product-workspace">
        <header className="workspace-header">
          <div className="workspace-breadcrumb">
            <span>{C.name}</span>
            <span>/</span>
            <strong>
              {S.nav.find(([href]) =>
                href === "/app"
                  ? canonical === href
                  : canonical.startsWith(href),
              )?.[1] ?? S.nav[1][1]}
            </strong>
          </div>
          <SetupGuide compact />
        </header>
        <main id="workspace-content">{children}</main>
      </div>
    </div>
  );
}
