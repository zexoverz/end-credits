import Image from "next/image";
export function PartnerLogo({ name, kind }: { name: string; kind: string }) {
  return (
    <span className={`partner-logo partner-logo-${kind}`}>
      <Image
        src={`/partners/${kind}.svg`}
        alt={name}
        width={kind === "intercepta" ? 24 : 167}
        height={34}
        unoptimized
      />
      {kind === "intercepta" && <span aria-hidden="true">{name}</span>}
    </span>
  );
}
