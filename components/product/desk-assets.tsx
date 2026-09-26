// Original End Credits linework: film perforations, paper records and mechanical controls.
// Decorative symbols do not encode balances or imply execution success.
export function DeskAsset({
  kind,
  compact = false,
}: {
  kind: "budget" | "wallet" | "signature" | "agent" | "session" | "hold";
  compact?: boolean;
}) {
  return (
    <svg
      className={`desk-asset ${compact ? "is-compact" : ""}`}
      viewBox="0 0 160 112"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "budget" ? (
        <>
          <path d="M28 90h112M28 29h102M28 53h102M28 77h102" />
          <rect x="42" y="18" width="18" height="22" rx="4" fill="#a8edc0" />
          <rect x="95" y="42" width="18" height="22" rx="4" fill="#fff" />
          <rect x="66" y="66" width="18" height="22" rx="4" fill="#dad2ed" />
          <path d="M13 27h5m-5 26h5m-5 26h5M136 18v11m-5-5h10" />
        </>
      ) : kind === "wallet" ? (
        <>
          <path d="M27 32 108 15v22" fill="#dad2ed" />
          <rect x="23" y="33" width="111" height="63" rx="10" fill="#fff" />
          <path d="M23 49h110M23 87h111" />
          <path d="M104 56h37v26h-37a13 13 0 0 1 0-26Z" fill="#a8edc0" />
          <circle cx="111" cy="69" r="3" fill="currentColor" />
          <path d="M39 61v10m7-10v10m7-10v10M42 22l-4-11m-6 17-10-2" />
        </>
      ) : kind === "signature" ? (
        <>
          <path d="M31 19h75l20 21v57H31z" fill="#fff" />
          <path d="M106 19v21h20M45 37h34M45 48h21M44 79c9-26 5 7 15-2s8-5 16-1M42 86h65" />
          <path d="m91 65 32-41 11 9-32 41-17 6Z" fill="#a8edc0" />
          <path d="m94 62 11 8M123 24l4-5q5-5 10 0t-3 14" />
          <path d="m17 62 6 3m113 25 7-1" />
        </>
      ) : kind === "agent" ? (
        <>
          <rect x="21" y="19" width="113" height="67" rx="8" fill="#fff" />
          <path d="M21 34h113M35 25h2m6 0h2m6 0h2M39 47l10 9-10 9m19 0h19M51 98h50M70 86v12" />
          <path d="M119 67v29q0 8 11 8t11-8V77" />
          <rect x="133" y="64" width="16" height="14" rx="3" fill="#a8edc0" />
          <path d="M138 58v6m6-6v6" />
        </>
      ) : kind === "hold" ? (
        <>
          <path d="M33 24h91v66H33z" fill="#fff" />
          <path d="M33 41h91M46 30h6m9 0h6m9 0h6M46 54h34M46 64h25" />
          <circle cx="111" cy="78" r="24" fill="#f0dfb2" />
          <path d="M104 68v20m14-20v20M24 97h105" />
        </>
      ) : (
        <>
          <rect x="24" y="22" width="112" height="73" rx="9" fill="#fff" />
          <path d="M24 38h112M24 78h112M34 28h7m12 0h7m12 0h7m12 0h7m12 0h7M34 85h7m12 0h7m12 0h7m12 0h7m12 0h7" />
          <circle cx="61" cy="58" r="13" fill="#a8edc0" />
          <circle cx="98" cy="58" r="13" fill="#dad2ed" />
          <path d="M49 13h59m-24-5h13M63 98v8m34-8v8" />
        </>
      )}
    </svg>
  );
}
export function PackageMark({ name }: { name: string }) {
  const type = name.includes("zod")
    ? "schema"
    : name.includes("date")
      ? "date"
      : name.includes("tailwind")
        ? "wave"
        : name === "next"
          ? "arrow"
          : "code";
  return (
    <svg
      className="credit-package-mark"
      viewBox="0 0 56 56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5h32l7 7v32l-7 7H12l-7-7V12Z" fill="#f5f7ef" />
      <path d="M12 14v5m0 7v5m0 7v5M44 14v5m0 7v5m0 7v5" stroke="#859279" />
      {type === "schema" ? (
        <>
          <path d="M23 17c-7 0-2 11-7 11 5 0 0 11 7 11m10-22c7 0 2 11 7 11-5 0 0 11-7 11" />
          <path d="m22 28 4 4 7-8" />
        </>
      ) : type === "date" ? (
        <>
          <rect x="18" y="19" width="20" height="20" rx="2" />
          <path d="M18 25h20m-15-9v6m10-6v6m-9 8h3m4 0h2m-9 5h3" />
        </>
      ) : type === "wave" ? (
        <>
          <path d="M17 26q6-12 13-3t10-3M17 35q6-12 13-3t10-3" />
        </>
      ) : type === "arrow" ? (
        <>
          <path d="M19 37V19l18 18V19M27 19h10v10" />
        </>
      ) : (
        <>
          <path d="m22 20-7 8 7 8m12-16 7 8-7 8m-3-19-6 22" />
        </>
      )}
    </svg>
  );
}
export function OutcomeMark({ outcome }: { outcome: string | null }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {outcome === "held" ? (
        <>
          <path d="M5 3v10m6-10v10" />
        </>
      ) : outcome === "reserved" ? (
        <>
          <path d="M3 3h10v10H3zM3 6h10" />
        </>
      ) : outcome === "refused" ? (
        <>
          <path d="m4 4 8 8m0-8-8 8" />
        </>
      ) : outcome !== "paid" && outcome !== "capped" ? (
        <path d="M3 8h10" />
      ) : (
        <>
          <path d="m3 8 3 3 7-7" />
          {outcome === "capped" && <path d="M3 2h10" />}
        </>
      )}
    </svg>
  );
}
