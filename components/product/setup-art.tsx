/** Original vector illustrations for the owner setup sheet. */
export function SetupArt({
  kind = "identity",
}: {
  kind?: "identity" | "allowance" | "agent" | "signature";
}) {
  if (kind === "signature")
    return (
      <svg
        viewBox="0 0 300 210"
        fill="none"
        aria-hidden="true"
        className="setup-art"
      >
        <path
          d="M64 30h131l28 28v121H64V30Z"
          fill="#fff"
          stroke="#293427"
          strokeWidth="2"
        />
        <path
          d="M195 30v28h28M84 66h77M84 81h104"
          stroke="#93a382"
          strokeWidth="2"
        />
        <path
          d="M89 132c28-55 21 19 47-18 10-13-3 30 19 10 8-7 6 1 17-2"
          stroke="#293427"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M84 151h105" stroke="#cad4be" strokeWidth="2" />
        <g transform="rotate(35 222 104)">
          <path
            d="M214 47h16v112l-8 17-8-17V47Z"
            fill="#c2b3df"
            stroke="#293427"
            strokeWidth="2"
          />
          <path d="M214 59h16m-16 91h16" stroke="#293427" strokeWidth="2" />
        </g>
        <circle
          cx="64"
          cy="169"
          r="26"
          fill="#b8e6bd"
          stroke="#293427"
          strokeWidth="2"
        />
        <path d="m53 169 8 8 15-18" stroke="#293427" strokeWidth="2" />
      </svg>
    );
  if (kind === "allowance")
    return (
      <svg
        viewBox="0 0 300 210"
        fill="none"
        aria-hidden="true"
        className="setup-art"
      >
        <ellipse cx="145" cy="179" rx="108" ry="14" fill="#d5dfc8" />
        <path
          d="M53 81 146 43l97 38v72l-97 34-93-34V81Z"
          fill="#f9faf3"
          stroke="#293427"
          strokeWidth="2"
        />
        <path
          d="m53 81 93 35 97-35m-97 35v71"
          stroke="#293427"
          strokeWidth="2"
        />
        <path
          d="m82 70 96 35v38l32-11V94l-95-37"
          fill="#b6e6c0"
          stroke="#293427"
          strokeWidth="2"
        />
        <circle
          cx="222"
          cy="59"
          r="30"
          fill="#e7dff4"
          stroke="#293427"
          strokeWidth="2"
        />
        <path d="M207 59h30m-15-15v30" stroke="#293427" strokeWidth="2" />
        <path
          d="M44 37h18m-9-9v18M259 134h14m-7-7v14"
          stroke="#718564"
          strokeWidth="2"
        />
      </svg>
    );
  if (kind === "agent")
    return (
      <svg
        viewBox="0 0 300 210"
        fill="none"
        aria-hidden="true"
        className="setup-art"
      >
        <path
          d="M51 143V61a14 14 0 0 1 14-14h148a14 14 0 0 1 14 14v82"
          fill="#263424"
          stroke="#263424"
          strokeWidth="2"
        />
        <path
          d="m42 143-16 20h230l-18-20H42Z"
          fill="#dfeacb"
          stroke="#263424"
          strokeWidth="2"
        />
        <path d="m79 80 16 15-16 15m33 0h33" stroke="#b1e8bf" strokeWidth="3" />
        <path
          d="M199 43V27h53v82h-23"
          stroke="#718564"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <circle
          cx="250"
          cy="121"
          r="23"
          fill="#c9bce5"
          stroke="#263424"
          strokeWidth="2"
        />
        <path d="m240 122 7 7 14-16" stroke="#263424" strokeWidth="2" />
        <path d="M93 181h135" stroke="#b3c2a5" strokeWidth="2" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 400 310"
      fill="none"
      aria-hidden="true"
      className="setup-art setup-identity-art"
    >
      <ellipse cx="202" cy="270" rx="139" ry="17" fill="#d0ddc0" />
      <g transform="rotate(-9 202 149)">
        <rect
          x="76"
          y="55"
          width="243"
          height="187"
          rx="19"
          fill="#f8f9f0"
          stroke="#293427"
          strokeWidth="2"
        />
        <path d="M77 99h242" stroke="#293427" strokeWidth="2" />
        <rect x="96" y="71" width="51" height="10" rx="5" fill="#a5ceb0" />
        <path d="M262 76h34" stroke="#293427" strokeWidth="2" />
        <rect x="98" y="122" width="71" height="81" rx="12" fill="#ddd4ed" />
        <circle cx="133" cy="148" r="12" fill="#293427" />
        <path d="M111 184c0-27 44-27 44 0" fill="#293427" />
        <path
          d="M192 137h93m-93 17h67m-67 26h42m-42 15h82"
          stroke="#84937b"
          strokeWidth="3"
        />
        <path d="M97 222h186" stroke="#c0cdb6" strokeWidth="2" />
      </g>
      <g className="setup-key">
        <circle
          cx="297"
          cy="228"
          r="31"
          fill="#b3e7bf"
          stroke="#293427"
          strokeWidth="2"
        />
        <circle cx="297" cy="222" r="8" stroke="#293427" strokeWidth="2" />
        <path d="M297 230v15m0-5h7" stroke="#293427" strokeWidth="2" />
      </g>
      <path
        d="M47 108h23m-11-11v23M330 46h19m-10-10v20"
        stroke="#677d57"
        strokeWidth="2"
      />
      <path d="m338 143 12 10-12 10" stroke="#677d57" strokeWidth="2" />
    </svg>
  );
}
