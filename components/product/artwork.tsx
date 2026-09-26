// Original code-native illustrations for End Credits. Decorative, with no embedded UI text.
export function StudioArtwork({
  kind = "press",
}: {
  kind?: "press" | "cast" | "vault" | "agent";
}) {
  if (kind === "vault")
    return (
      <svg viewBox="0 0 240 180" fill="none" aria-hidden="true">
        <ellipse cx="125" cy="156" rx="86" ry="10" fill="#dfddd2" />
        <path
          d="m49 39 118-15 35 20v104l-117 17-36-22Z"
          fill="#c7bbed"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m49 39 36 22 117-17M85 61v104"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m99 76 87-12v68l-87 12Z"
          fill="#f7f7f0"
          stroke="#252724"
          strokeWidth="2"
        />
        <ellipse
          cx="143"
          cy="103"
          rx="24"
          ry="26"
          fill="#a6eec2"
          stroke="#252724"
          strokeWidth="2"
        />
        <path d="m143 83 0 40m-16-19 33-4" stroke="#252724" strokeWidth="3" />
        <circle
          cx="143"
          cy="102"
          r="7"
          fill="#fff"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m39 72-14-3m7 40-14 5M189 15l7-10m15 26 14-3"
          stroke="#252724"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  if (kind === "cast")
    return (
      <svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
        <ellipse cx="158" cy="173" rx="117" ry="14" fill="#e7e4d9" />
        <path
          d="m57 94 53-30 56 32-53 31Z"
          fill="#c9b9f0"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m57 94 56 33v50l-56-33Z"
          fill="#aa94d6"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m113 127 53-31v50l-53 31Z"
          fill="#e6dbfa"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m84 80 55 32v20l-14 8v-20L70 88"
          fill="#fffdf4"
          stroke="#252724"
          strokeWidth="1.5"
        />
        <path
          d="m157 59 52-30 56 32-53 31Z"
          fill="#b1f1c6"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m157 59 55 33v68l-55-33Z"
          fill="#80c99a"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m212 92 53-31v68l-53 31Z"
          fill="#d0f8da"
          stroke="#252724"
          strokeWidth="2"
        />
        <path
          d="m184 44 55 32v24l-13 8V84l-55-32"
          fill="#fffdf4"
          stroke="#252724"
          strokeWidth="1.5"
        />
        <path
          d="m134 36 2-18m-15 12 28-8M274 152l10 2m-8-8 2 13M33 52l-8-10m13 5 7-8"
          stroke="#252724"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m175 111 20 11m-20-3 11 6M69 126l22 13m-22-5 12 7"
          stroke="#252724"
          strokeWidth="2"
        />
      </svg>
    );
  if (kind === "agent")
    return (
      <svg viewBox="0 0 340 250" fill="none" aria-hidden="true">
        <ellipse cx="170" cy="226" rx="132" ry="14" fill="#dedbce" />
        <path
          d="m50 59 180-20 33 18v135l-180 21-33-18Z"
          fill="#fafaf4"
          stroke="#222720"
          strokeWidth="2"
        />
        <path
          d="m50 59 33 20 180-22M83 79v134"
          stroke="#222720"
          strokeWidth="2"
        />
        <path d="m99 97 146-17v94l-146 17Z" fill="#252e27" />
        <path
          d="m119 117 11 8-11 11m23 0 28-4"
          stroke="#adf3c4"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="m115 158 60-7m-60 15 96-11" stroke="#91a486" strokeWidth="2" />
        <path
          d="M214 180v28q0 20 23 17h22q21 0 21-22v-27"
          stroke="#222720"
          strokeWidth="3"
        />
        <rect
          x="266"
          y="139"
          width="29"
          height="39"
          rx="8"
          fill="#c7bbed"
          stroke="#222720"
          strokeWidth="2"
        />
        <path
          d="M273 139v-13m14 13v-13M178 26v-14m-7 7h14M24 149l-12 4m17 9-4 10"
          stroke="#222720"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle
          cx="241"
          cy="202"
          r="24"
          fill="#a6eec2"
          stroke="#222720"
          strokeWidth="2"
        />
        <path d="m232 202 6 6 12-14" stroke="#222720" strokeWidth="2" />
      </svg>
    );
  return (
    <svg viewBox="0 0 430 300" fill="none" aria-hidden="true">
      <ellipse cx="223" cy="271" rx="155" ry="14" fill="#bdd6b2" />
      <path
        d="M119 108 261 77l81 44-142 32Z"
        fill="#fcfcef"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m119 108 81 45v112l-81-45Z"
        fill="#cbc1e8"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m200 153 142-32v112l-142 32Z"
        fill="#f9f9ee"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m214 171 108-24v15l-108 24Z"
        fill="#262d24"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m227 165 78-18v93l-8-5-8 8-8-4-8 8-8-4-8 8-8-4-8 8-8-4-6 6Z"
        fill="#fffef8"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m243 183 45-10m-45 23 34-8m-34 20 45-10m-45 22 21-5"
        stroke="#636d5e"
        strokeWidth="2"
      />
      <path d="m276 213 6 5 11-15" stroke="#438359" strokeWidth="3" />
      <ellipse
        cx="172"
        cy="98"
        rx="41"
        ry="47"
        transform="rotate(-24 172 98)"
        fill="#a9dfb8"
        stroke="#20251f"
        strokeWidth="2"
      />
      <ellipse
        cx="172"
        cy="98"
        rx="32"
        ry="38"
        transform="rotate(-24 172 98)"
        fill="#f7f7e9"
        stroke="#20251f"
        strokeWidth="2"
      />
      <circle cx="172" cy="98" r="9" fill="#262d24" />
      <ellipse
        cx="163"
        cy="72"
        rx="9"
        ry="11"
        transform="rotate(-24 163 72)"
        fill="#c7bbed"
        stroke="#20251f"
        strokeWidth="1.5"
      />
      <ellipse
        cx="191"
        cy="103"
        rx="8"
        ry="10"
        transform="rotate(-24 191 103)"
        fill="#c7bbed"
        stroke="#20251f"
        strokeWidth="1.5"
      />
      <ellipse
        cx="162"
        cy="121"
        rx="8"
        ry="10"
        transform="rotate(-24 162 121)"
        fill="#c7bbed"
        stroke="#20251f"
        strokeWidth="1.5"
      />
      <circle cx="151" cy="180" r="9" fill="#262d24" />
      <path d="m138 202 26 15M214 117l69-15" stroke="#20251f" strokeWidth="2" />
      <path
        d="m263 54 31-16 32 18-31 18Z"
        fill="#bdf0ca"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m263 54 32 20v33l-32-20Zm32 20 31-18v33l-31 18Z"
        fill="#ddf9df"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path d="m280 46 29 20v12" stroke="#20251f" strokeWidth="2" />
      <path
        d="M100 70V46m-12 12h24m243 27 10-13m-3 28 17-3M81 194l-15 4m18 11-9 12"
        stroke="#20251f"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m348 249 25-14 17 10-25 14Z"
        fill="#f0d5a8"
        stroke="#20251f"
        strokeWidth="2"
      />
      <path
        d="m348 249 17 10v10l-17-10Zm17 10 25-14v10l-25 14Z"
        fill="#fff0ce"
        stroke="#20251f"
        strokeWidth="2"
      />
    </svg>
  );
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
