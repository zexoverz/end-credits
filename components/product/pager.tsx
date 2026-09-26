import { WORKSPACE as C } from "@/lib/copy/workspace";
export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="desk-pager" aria-label={C.page}>
      <span>
        {C.page} {page + 1} {C.of} {pages}
      </span>
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        aria-label={C.previous}
      >
        ←
      </button>
      <button
        type="button"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
        aria-label={C.next}
      >
        →
      </button>
    </nav>
  );
}
