import type { SVGProps } from "react";

export function Arrow({
  down = false,
  ...props
}: SVGProps<SVGSVGElement> & { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      {...props}
    >
      <path d={down ? "M12 4v16m-6-6 6 6 6-6" : "M5 19 19 5M5 5h14v14"} />
    </svg>
  );
}

export function BrandMark({ ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 160" fill="none" aria-hidden="true" {...props}>
      <circle
        cx="87"
        cy="87"
        r="57"
        fill="#ADF3C0"
        stroke="#20261F"
        strokeWidth="7"
      />
      <path d="M121 47l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M132 63l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M134 83l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M129 103l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M116 120l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M98 130l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M77 134l9 9" stroke="#20261F" strokeWidth="3.5" />
      <path d="M57 128l9 9" stroke="#20261F" strokeWidth="3.5" />
      <circle
        cx="72"
        cy="72"
        r="57"
        fill="#ADF3C0"
        stroke="#20261F"
        strokeWidth="7"
      />
      <circle
        cx="72"
        cy="72"
        r="44"
        fill="none"
        stroke="#20261F"
        strokeWidth="2.5"
      />
      <path
        d="M49 45H94L95 60H91Q87 50 78 50H67V69H74Q81 69 82 62H86V81H82Q81 74 74 74H67V94H79Q90 94 93 83H97L94 99H49V95L55 93V51L49 49Z"
        fill="#20261F"
      />
    </svg>
  );
}

// Original vector artwork. No downloaded illustrations or sponsor-logo approximations.
export function CreditsMachine({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 360 490"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="#191b18"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 438h320" />
        <g className="ec-package">
          <path d="m182 30 76-23 73 27-77 26Z" fill="#9bf6b8" />
          <path d="M182 30v76l72 31V60Z" fill="white" />
          <path d="m254 60 77-26v74l-77 29Z" fill="#f0f0eb" />
          <path d="m216 20 74 27v27l-17 6V53L200 25" />
          <path d="m199 64 24 11m-24 0 15 7m60 21 33-12" />
        </g>
        <path d="m92 27 4 16 16 4-16 5-4 16-5-16-16-5 16-4Z" fill="#9bf6b8" />
        <path d="M150 73v15m-7-8h15m179 63v13m-7-6h14" />
        <path d="M284 162c43 31 45 71 7 98" strokeDasharray="3 8" />
        <g transform="rotate(-16 161 225)">
          <path
            d="M63 212c0-55 40-100 91-100h18c51 0 91 45 91 100s-40 100-91 100h-18c-51 0-91-45-91-100Z"
            fill="#191b18"
          />
          <ellipse cx="149" cy="212" rx="91" ry="100" fill="white" />
          <ellipse cx="149" cy="212" rx="78" ry="87" />
          <g fill="#f0f0eb">
            <ellipse cx="147" cy="156" rx="21" ry="23" />
            <ellipse cx="199" cy="202" rx="21" ry="23" />
            <ellipse cx="174" cy="258" rx="21" ry="23" />
            <ellipse cx="115" cy="253" rx="21" ry="23" />
            <ellipse cx="99" cy="194" rx="21" ry="23" />
          </g>
          <circle cx="149" cy="212" r="16" fill="#9bf6b8" />
          <circle cx="149" cy="212" r="5" fill="#191b18" />
          <path
            d="m238 187 13-2m-11 19 15-2m-16 20 15-1m-18 19 13-1m-21 19 14-1m-25 16 12 1m-23 15 11 1"
            stroke="white"
            strokeWidth="1.4"
          />
          <path d="M154 312h128v49H146c-40 0-71 12-71 38" fill="white" />
          <path d="M154 328h128m-132 17h132" />
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} fill="#191b18">
              <rect x={158 + i * 21} y="316" width="10" height="7" rx="1" />
              <rect x={158 + i * 21} y="350" width="10" height="7" rx="1" />
            </g>
          ))}
        </g>
        <g transform="translate(222 350)">
          <path d="M-8 23v21c0 13 27 23 60 23s60-10 60-23V23" fill="#191b18" />
          <ellipse cx="52" cy="23" rx="60" ry="23" fill="white" />
          <ellipse cx="52" cy="23" rx="46" ry="15" />
          {Array.from({ length: 11 }, (_, i) => (
            <path
              key={i}
              d={`M${i * 10 + 2} ${44 + Math.sin((i / 10) * Math.PI) * 2}v16`}
              stroke="white"
              strokeWidth="1.2"
            />
          ))}
          <path d="M-20 0v20c0 13 27 23 60 23s60-10 60-23V0" fill="white" />
          <ellipse cx="40" cy="0" rx="60" ry="23" fill="#9bf6b8" />
          <ellipse cx="40" cy="0" rx="46" ry="15" />
          <path d="m26 0 9 5 17-10" />
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M${i * 11 - 12} 16v16`} strokeWidth="1.2" />
          ))}
        </g>
        <g transform="rotate(-25 120 407)">
          <ellipse cx="126" cy="408" rx="49" ry="25" fill="#191b18" />
          <ellipse cx="120" cy="400" rx="49" ry="25" fill="white" />
          <ellipse cx="120" cy="400" rx="37" ry="17" />
          <path d="m111 394-9 6 9 6m18-12 9 6-9 6m-6-15-7 18" strokeWidth="2" />
        </g>
        <path d="m313 299 4 14 14 4-14 4-4 14-4-14-14-4 14-4Z" />
      </g>
    </svg>
  );
}

export function Spark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.8">
        <path d="M40 5v70M5 40h70M15 15l50 50M15 65l50-50M26 8l28 64M8 26l64 28M8 54l64-28M26 72l28-64" />
      </g>
      <circle cx="40" cy="40" r="11" fill="currentColor" />
    </svg>
  );
}

export function ShieldArt({ state = "paid" }: { state?: string }) {
  return (
    <svg viewBox="0 0 400 340" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse
          cx="200"
          cy="302"
          rx="113"
          ry="13"
          fill="#e8e8e2"
          stroke="none"
        />
        <path
          d="m200 24 100 39v87c0 80-100 127-100 127S100 230 100 150V63Z"
          fill="white"
        />
        <path d="m200 43 83 32v75c0 59-66 101-83 110-17-9-83-51-83-110V75Z" />
        <circle
          cx="200"
          cy="137"
          r="47"
          fill={
            state === "held"
              ? "#ffe5a1"
              : state === "refused"
                ? "#f6d9d2"
                : "#9bf6b8"
          }
        />
        {state === "held" ? (
          <path d="M187 118v38m26-38v38" strokeWidth="5" />
        ) : state === "refused" ? (
          <path d="m185 122 30 30m-30 0 30-30" strokeWidth="4" />
        ) : state === "reserved" ? (
          <>
            <rect x="179" y="131" width="42" height="30" rx="5" />
            <path d="M188 131v-12a12 12 0 0 1 24 0v12" />
          </>
        ) : state === "capped" ? (
          <path d="M177 137h46m-46-14v28m46-28v28" strokeWidth="4" />
        ) : (
          <path d="m178 138 15 16 31-36" strokeWidth="4" />
        )}
        <path
          d="m48 85 5 15 16 5-16 5-5 16-5-16-16-5 16-5Zm282 113 5 15 16 5-16 5-5 16-5-16-16-5 16-5Z"
          fill="#9bf6b8"
        />
        <path
          d="M46 193c0 51 42 89 100 89m175-218 17-12m-11 37 23-2"
          strokeDasharray="3 8"
        />
        <circle cx="65" cy="216" r="23" fill="white" />
        <path d="m55 216 7 7 14-16" />
      </g>
    </svg>
  );
}

export function FolderArt() {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <path
          d="M20 29a8 8 0 0 1 8-8h32l13 14h59a8 8 0 0 1 8 8v57H20Z"
          fill="#f7f6f1"
        />
        <path d="M12 49h136l-11 53H23Z" fill="#9bf6b8" />
        <path d="m60 65-10 10 10 10m40-20 10 10-10 10m-16-24-8 28" />
      </g>
    </svg>
  );
}
