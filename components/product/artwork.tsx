import type { ReactNode } from "react";

// End Credits field notes: eight original editorial drawings, each tied to a product task.
// Shared pen weight and paper/mint palette, distinct silhouettes and compositions.
type ArtKind =
  | "signals"
  | "session"
  | "screen"
  | "claim"
  | "press"
  | "cast"
  | "vault"
  | "agent";
function Drawing({ children, kind }: { children: ReactNode; kind: ArtKind }) {
  return (
    <svg
      viewBox="0 0 360 240"
      fill="none"
      aria-hidden="true"
      className={`desk-line-art art-${kind}`}
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}
function OrbitTicks() {
  return (
    <g strokeWidth="1" opacity=".5">
      {Array.from({ length: 16 }, (_, i) => (
        <path key={i} d="M180 26v6" transform={`rotate(${i * 22.5} 180 120)`} />
      ))}
    </g>
  );
}
export function StudioArtwork({ kind = "press" }: { kind?: ArtKind }) {
  switch (kind) {
    case "signals":
      return (
        <Drawing kind={kind}>
          <circle cx="180" cy="120" r="91" strokeDasharray="2 7" opacity=".4" />
          <OrbitTicks />
          <circle cx="180" cy="120" r="66" fill="#fcfdf7" />
          <circle cx="180" cy="120" r="51" strokeWidth="1" />
          <path d="M180 69v102m-51-51h102" strokeWidth="1" opacity=".3" />
          <path
            d="M180 120V70a50 50 0 0 1 50 50Z"
            fill="#a3f0b6"
            stroke="none"
            className="art-scan"
          />
          <circle cx="180" cy="120" r="22" fill="#222a22" />
          <path d="m174 110-8 10 8 10m12-20 8 10-8 10" stroke="#c2f8cf" />
          <circle cx="208" cy="91" r="5" fill="#a3f0b6" />
          <circle cx="150" cy="147" r="4" fill="#a3f0b6" />
          <g transform="rotate(-12 65 84)">
            <rect x="28" y="48" width="67" height="77" rx="9" fill="white" />
            <path d="M41 63h20m-20 13h40M41 88h29m-29 13h16" />
            <path d="M75 106h9m-4-5v10" />
          </g>
          <g transform="rotate(10 288 160)">
            <rect
              x="255"
              y="125"
              width="70"
              height="75"
              rx="9"
              fill="#a3f0b6"
            />
            <path d="m276 143-9 10 9 10m26-20 9 10-9 10m-15-22-5 24M269 182h42" />
          </g>
          <path d="m77 164 15 0m-7-7v14m185-117 12 0m-6-6v12M106 199h25m99-162h17" />
          <path d="M96 84h18m132 76h10" strokeDasharray="2 5" />
        </Drawing>
      );
    case "session":
      return (
        <Drawing kind={kind}>
          <g transform="rotate(-8 141 121)">
            <rect
              x="47"
              y="47"
              width="186"
              height="141"
              rx="12"
              fill="#fcfdf7"
            />
            <path d="M47 70h186M47 164h186" />
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i} fill="#222a22" stroke="none">
                <rect x={60 + i * 24} y="55" width="9" height="7" rx="1" />
                <rect x={60 + i * 24} y="172" width="9" height="7" rx="1" />
              </g>
            ))}
            <rect x="65" y="83" width="63" height="68" rx="5" fill="#a3f0b6" />
            <path d="m88 104 23 14-23 14Z" fill="#222a22" />
            <path d="M145 93h63m-63 14h40m-40 21h59m-59 14h28" />
          </g>
          <path d="M212 107h82a13 13 0 0 1 13 13v88h-95Z" fill="#a3f0b6" />
          <path d="M204 100h78a13 13 0 0 1 13 13v87h-91Z" fill="white" />
          <path d="M218 123h54m-54 16h35m-35 16h48m-48 18h16" />
          <circle cx="269" cy="178" r="5" fill="#a3f0b6" />
          <path d="M264 37v17m-8-8h16M51 213h44m-62-21h15" />
        </Drawing>
      );
    case "screen":
      return (
        <Drawing kind={kind}>
          <rect x="51" y="57" width="185" height="126" rx="13" fill="white" />
          <path d="M51 83h185" />
          <circle cx="66" cy="70" r="2" fill="currentColor" />
          <circle cx="77" cy="70" r="2" fill="currentColor" />
          <rect
            x="65"
            y="101"
            width="155"
            height="23"
            rx="4"
            fill="#b4f4c3"
            stroke="none"
          />
          <path d="M74 113h11m8 0h11m8 0h11m8 0h11m8 0h11M74 139h24m9 0h49m-82 18h70" />
          <path d="m246 137 56 57-17 17-57-56" fill="#a3f0b6" />
          <circle cx="222" cy="106" r="53" fill="#fcfdf7" />
          <circle cx="222" cy="106" r="42" strokeWidth="1" />
          <path d="m202 105 14 14 27-29" strokeWidth="3" />
          <path d="M196 76a34 34 0 0 1 24-9" strokeWidth="1" />
          <path d="M71 35h25m-12-12v25M315 109h12m-6-6v12M59 207h108" />
        </Drawing>
      );
    case "cast":
      return (
        <Drawing kind={kind}>
          <path
            d="M53 83v110c49-14 86-4 127 19 42-23 80-33 128-19V83c-42-12-86 0-128 24C138 83 96 71 53 83Z"
            fill="#a3f0b6"
          />
          <path
            d="M63 69v111c39-5 78 3 117 24V94C139 72 101 64 63 69Z"
            fill="white"
          />
          <path
            d="M180 94v110c38-21 78-29 117-24V69c-39-5-79 3-117 25Z"
            fill="#fcfdf7"
          />
          <path
            d="M180 107v95M82 143l30 5m-30 11 63 16m67-52 65-15m-65 31 51-12m-51 30 65-15"
            strokeWidth="1.5"
          />
          <path d="m105 91-14 11 14 16m31-15 14 17-14 10m-16-39-5 40" />
          <path d="M220 60V26h39v47l-19-10-20 12" fill="#a3f0b6" />
          <path d="m231 43 7 6 11-12M37 45v17m-8-8h16m271 70h13m-6-6v12" />
        </Drawing>
      );
    case "vault":
      return (
        <Drawing kind={kind}>
          <ellipse
            cx="179"
            cy="208"
            rx="94"
            ry="9"
            strokeDasharray="2 6"
            opacity=".4"
          />
          <path d="M118 47h122M118 193h122" strokeWidth="5" />
          <path
            d="M130 50c0 33 11 45 35 70-24 24-35 39-35 70h98c0-31-11-46-35-70 24-25 35-37 35-70Z"
            fill="#fcfdf7"
          />
          <path
            d="M140 70h78c-5 19-18 32-39 47-21-15-34-28-39-47Z"
            fill="#a3f0b6"
            stroke="none"
          />
          <path
            d="M140 182c9-12 22-23 39-35 17 12 30 23 39 35Z"
            fill="#a3f0b6"
          />
          <path d="M179 124v12" strokeDasharray="2 5" />
          <circle cx="265" cy="77" r="26" fill="#a3f0b6" />
          <path d="M260 66v22m10-22v22" />
          <path d="M102 105H80m22 14H64m30 14H81M259 169h17m-8-8v16M110 27h16" />
        </Drawing>
      );
    case "claim":
      return (
        <Drawing kind={kind}>
          <path
            d="M59 93V65a11 11 0 0 1 11-11h64l19 21h91a11 11 0 0 1 11 11v106H59Z"
            fill="#fcfdf7"
          />
          <path d="m48 99 28 103h177l26-103Z" fill="#a3f0b6" />
          <path d="M97 118h55m-55 14h33" />
          <g transform="rotate(-25 250 112)">
            <circle cx="245" cy="88" r="31" fill="white" />
            <circle cx="245" cy="83" r="9" />
            <path d="M236 117v74h18v-18h16v-14h-16v-42" fill="#fcfdf7" />
          </g>
          <path d="M289 36v20m-10-10h20M35 64h12m-6-6v12M76 221h144" />
        </Drawing>
      );
    case "agent":
      return (
        <Drawing kind={kind}>
          <rect x="46" y="40" width="194" height="126" rx="14" fill="white" />
          <path d="M46 65h194" />
          <circle cx="61" cy="53" r="2" fill="currentColor" />
          <circle cx="72" cy="53" r="2" fill="currentColor" />
          <path d="m70 86 13 13-13 13m30 0h23M71 137h95" />
          <path d="M146 167v21c0 17 15 25 39 25h75c23 0 35-14 35-34v-27" />
          <path d="M275 151v-28h40v28a20 20 0 0 1-40 0Z" fill="#a3f0b6" />
          <path d="M284 123v-19m22 19v-19" strokeWidth="4" />
          <rect x="176" y="91" width="64" height="51" rx="11" fill="#a3f0b6" />
          <path d="m193 115 9 9 19-22M189 83v-9m12 9v-9m13 9v-9m13 9v-9M189 150v9m12-9v9m13-9v9m13-9v9" />
          <path d="M278 54h17m-8-8v16M48 195h38m-17-8v16" />
        </Drawing>
      );
    default:
      return (
        <Drawing kind={kind}>
          <g transform="rotate(-11 160 121)">
            <path
              d="M90 37h118v159l-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7Z"
              fill="white"
            />
            <path d="M90 68h118" strokeDasharray="3 5" />
            <path d="M110 53h39m-39 36h75m-75 16h57m-57 22h75m-75 16h29" />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${108 + i * 7} 161v17`}
                strokeWidth={i % 3 === 0 ? 3 : 1}
              />
            ))}
          </g>
          <path d="M221 102v72l16-11 16 11v-72" fill="#a3f0b6" />
          <circle cx="237" cy="87" r="36" fill="#a3f0b6" />
          <circle cx="237" cy="87" r="27" strokeWidth="1" />
          <path d="m224 88 9 9 18-21M46 87v19m-9-9h18M280 191h26m-13-13v26M85 220h134" />
        </Drawing>
      );
  }
}
export function PackageGlyph({ name }: { name: string }) {
  const known: Record<string, number> = {
    zod: 0,
    "date-fns": 1,
    chalk: 2,
    prettier: 3,
    vitest: 4,
    pnpm: 5,
  };
  const hash = Array.from(name).reduce(
    (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
    7,
  );
  const variant = known[name.toLowerCase()] ?? hash % 6;
  const colors = [
    "#c4e8da",
    "#efd9b5",
    "#d8cef0",
    "#efccd0",
    "#dfeab6",
    "#c9e1ee",
  ];
  return (
    <span
      className="package-glyph"
      style={{ background: colors[variant] }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        stroke="#28332a"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {variant === 0 ? (
          <>
            <path d="m8 14 12-7 12 7v13l-12 7-12-7Zm0 0 12 8 12-8M20 22v12M14 11l12 7" />
          </>
        ) : variant === 1 ? (
          <>
            <circle cx="20" cy="21" r="12" />
            <path d="M20 13v9l6 3M16 5h8M20 5v4M31 9l-3 4" />
          </>
        ) : variant === 2 ? (
          <>
            <path d="m9 29 3-10L26 5l9 9-14 14-12 4Zm3-10 9 9m2-20 9 9M9 32h24" />
            <path d="m13 28 3 3" />
          </>
        ) : variant === 3 ? (
          <>
            <path d="M7 10h17m5 0h4M7 16h7m5 0h14M7 22h18m4 0h4M7 28h7m5 0h14M7 34h17" />
          </>
        ) : variant === 4 ? (
          <>
            <path d="m22 5-13 17h10l-2 14 15-20H21Z" />
            <path d="m6 9 3 3m23 17 3 3" />
          </>
        ) : (
          <>
            <path d="M6 7h10v10H6Zm18 0h10v10H24ZM6 25h10v10H6Zm18 0h10v10H24Z" />
            <path d="M16 12h8M11 17v8m18-8v8M16 30h8" />
          </>
        )}
      </svg>
    </span>
  );
}
