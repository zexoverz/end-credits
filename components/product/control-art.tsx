export function ControlArt({
  kind = "budget",
}: {
  kind?: "budget" | "wallet" | "agent";
}) {
  return (
    <svg
      viewBox="0 0 220 140"
      className={`control-art control-art-${kind}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "budget" ? (
        <>
          <path d="M30 108a80 80 0 0 1 160 0" strokeDasharray="3 7" />
          <path
            d="M47 108a63 63 0 0 1 126 0"
            strokeWidth="12"
            stroke="#d6e9c9"
          />
          <path
            d="M47 108a63 63 0 0 1 108-45"
            strokeWidth="12"
            stroke="#7eaa75"
          />
          <circle cx="110" cy="108" r="8" fill="#fbfcf6" />
          <path d="m115 101 30-39M35 127h150M70 53l5 8m35-20v9m40 3-5 8" />
          <circle cx="180" cy="29" r="13" fill="#dcd0ef" />
          <path d="M174 29h12m-6-6v12" />
        </>
      ) : kind === "wallet" ? (
        <>
          <rect x="47" y="31" width="132" height="86" rx="15" fill="#f7fbf1" />
          <path
            d="M48 49h130M149 64h36v34h-36a17 17 0 0 1 0-34Z"
            fill="#d5c7eb"
          />
          <circle cx="151" cy="81" r="4" />
          <path d="M67 71h35m-35 10h23M63 20h86M35 44V29m-7 8h15" />
          <circle cx="183" cy="22" r="11" fill="#a2f4bc" />
          <path d="m178 22 3 3 6-7M65 108h35" />
        </>
      ) : (
        <>
          <rect x="67" y="39" width="87" height="66" rx="12" fill="#fbfcf6" />
          <path d="M84 60h53M87 75l8 6-8 6m24 0h19M109 26v13" />
          <circle cx="109" cy="19" r="7" fill="#c8b7e3" />
          <path
            d="M39 76h28m87 0h27M109 105v19M47 51l13 9m97 45 13 11"
            strokeDasharray="3 5"
          />
          <rect x="17" y="65" width="22" height="22" rx="5" fill="#a2f4bc" />
          <circle cx="192" cy="76" r="11" fill="#a2f4bc" />
          <path d="m187 76 3 3 6-7" />
        </>
      )}
    </svg>
  );
}
