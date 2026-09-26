import Link from "next/link";
import { Page } from "@/components/ui";
import { PackageSearch } from "@/components/product/package-search";
import { StudioArtwork, PackageGlyph } from "@/components/product/artwork";
import { EXPERIENCE as C } from "@/lib/copy/experience";
import { STUDIO as S } from "@/lib/copy/studio";
export default function Packages() {
  return (
    <Page title={S.packagesTitle}>
      <p className="studio-page-subtitle">{S.packagesBody}</p>
      <div className="studio-package-search">
        <PackageSearch />
        <StudioArtwork kind="cast" />
      </div>
      <div className="studio-collection-heading">
        <h2>{S.packageCollection}</h2>
        <p>{C.packageNote}</p>
      </div>
      <div className="studio-project-grid">
        {C.packages.map((p) => (
          <Link href={`/app/npm/${p.name.toLowerCase()}`} key={p.name}>
            <PackageGlyph name={p.name} />
            <span aria-hidden="true" className="project-open">
              ↗
            </span>
            <h3>{p.name}</h3>
            <p>{p.role}</p>
            <span className="project-explore">{S.explorePackage} ↗</span>
          </Link>
        ))}
      </div>
      <aside className="studio-maintainer">
        <StudioArtwork kind="vault" />
        <div>
          <p className="studio-kicker">{S.maintainerTag}</p>
          <h2>{S.maintainerTitle}</h2>
          <p>{S.maintainerBody}</p>
        </div>
      </aside>
    </Page>
  );
}
