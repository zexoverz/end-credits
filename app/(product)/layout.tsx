import Link from "next/link";
import { WEBSITE as C } from "@/lib/copy/website";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <><header className="border-b border-line"><nav aria-label={C.navigation} className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm"><Link href="/landing" className="font-semibold">{C.name}</Link>{C.productNav.map(([href, label]) => <Link key={href} href={href} className="text-muted hover:text-foreground">{label}</Link>)}</nav></header><main className="flex-1">{children}</main></>;
}
