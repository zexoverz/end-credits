import Link from "next/link";
import { Page, Card } from "@/components/ui";
import { PackageSearch } from "@/components/product/package-search";
import { EXPERIENCE as C } from "@/lib/copy/experience";
export default function Packages() {
  return (
    <Page title={C.packagePage}>
      <div className="package-lookup">
        <p className="page-intro">{C.packageIntro}</p>
        <Card>
          <PackageSearch />
        </Card>
        <div className="package-examples">
          {C.packages.map((p) => (
            <Link href={`/app/npm/${p.name.toLowerCase()}`} key={p.name}>
              <span>{p.mark}</span>
              <strong>{p.name}</strong>
              <small>{p.role}</small>
              <i aria-hidden="true">↗</i>
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">{C.packageNote}</p>
      </div>
    </Page>
  );
}
