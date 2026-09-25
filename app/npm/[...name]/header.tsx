// The package header: name, repo, what is reserved, other funding links, payee and cooling.
import { Mono } from "@/components/ui";
import { githubRepoUrl, reserveLine, type Notice, type PackageSummary } from "@/lib/client/claim";
import { addressUrl } from "@/lib/client/format";
import { claimCopy } from "@/lib/copy/claim";

export function NoticeLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  const cls =
    notice.tone === "error"
      ? "border-refused/40 bg-refused/10 text-refused"
      : notice.tone === "ok"
        ? "border-paid/40 bg-paid/10 text-paid"
        : "border-line bg-background text-foreground";
  return <p className={`rounded border px-3 py-2 text-sm ${cls}`}>{notice.text}</p>;
}

export function Header({ s }: { s: PackageSummary }) {
  return (
    <header className="mb-6 space-y-3">
      <h1 className="font-mono text-2xl font-semibold">{s.package}</h1>
      {s.repo ? (
        <p className="text-sm text-muted">
          {claimCopy("REPO")}:{" "}
          <a className="underline" href={githubRepoUrl(s.repo)} target="_blank" rel="noreferrer">
            {s.repo}
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted">{claimCopy("NO_REPO")}</p>
      )}
      <NoticeLine notice={reserveLine(s)} />
      {s.alsoAccepts.length > 0 && (
        <p className="text-sm">
          {claimCopy("ALSO_ACCEPTS")}:{" "}
          {s.alsoAccepts.map((u, i) => (
            <span key={u}>
              {i > 0 && ", "}
              <a className="underline" href={u} target="_blank" rel="noreferrer">
                {u}
              </a>
            </span>
          ))}
        </p>
      )}
      {s.alreadyPayable && <NoticeLine notice={{ tone: "info", text: s.alreadyPayable, code: "ALREADY_PAYABLE" }} />}
      {s.payee && (
        <p className="text-sm">
          {claimCopy("PAYEE")}:{" "}
          <a className="underline" href={addressUrl(s.payee.address)} target="_blank" rel="noreferrer">
            <Mono>{s.payee.address}</Mono>
          </a>{" "}
          <span className="text-muted">({s.payee.source})</span>
        </p>
      )}
      {s.errors.includes("payee") && <NoticeLine notice={{ tone: "error", text: claimCopy("PAYEE_ERROR"), code: "payee" }} />}
      {s.cooling && <NoticeLine notice={{ tone: "info", text: s.cooling.message, code: "COOLING" }} />}
    </header>
  );
}
