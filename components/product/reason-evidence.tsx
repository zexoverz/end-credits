import { INSIGHTS as C } from "@/lib/copy/control-room";
export function ReasonEvidence({
  reasons,
  featuredOnly = false,
}: {
  reasons: unknown;
  featuredOnly?: boolean;
}) {
  const rows = (Array.isArray(reasons) ? reasons : [])
    .flatMap((value): { text: string; code: string; source: string }[] => {
      if (typeof value === "string")
        return [{ text: value, code: "", source: "" }];
      if (!value || typeof value !== "object" || typeof value.text !== "string")
        return [];
      return [
        {
          text: value.text,
          code: typeof value.code === "string" ? value.code : "",
          source: typeof value.source === "string" ? value.source : "",
        },
      ];
    })
    .filter(
      (r) =>
        !featuredOnly ||
        r.code.includes("SIMULAT") ||
        r.code.startsWith("PAYER_"),
    );
  if (!rows.length) return null;
  return (
    <ul className="reason-evidence">
      {rows.map((r, i) => (
        <li
          key={`${r.code}-${i}`}
          data-reason-code={r.code}
          data-evidence-tone={
            r.code === "SIMULATED"
              ? "checked"
              : r.code.includes("REFUSED")
                ? "refused"
                : r.code.includes("HELD") || r.code.includes("UNAVAILABLE")
                  ? "held"
                  : "neutral"
          }
        >
          <small>
            {r.code.startsWith("PAYER_")
              ? C.reasonKind.payer
              : r.code.includes("SIMULAT")
                ? C.reasonKind.payment
                : C.reasonKind.other}
            {r.code && ` · ${r.code}`}
          </small>
          <p>{r.text}</p>
        </li>
      ))}
    </ul>
  );
}
