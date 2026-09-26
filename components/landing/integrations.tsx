import { INTEGRATIONS as C } from "@/lib/copy/product-story";
import { PartnerLogo } from "./partner-logo";
import s from "@/app/landing/technical.module.css";
export function Integrations() {
  return (
    <section className={s.integrations} aria-labelledby="integration-title">
      <header data-reveal>
        <p className={s.eyebrow}>{C.eyebrow}</p>
        <h2 id="integration-title">{C.title}</h2>
        <p>{C.body}</p>
      </header>
      <div className={s.partnerGrid}>
        {C.items.map((p) => (
          <a key={p.name} href={p.url} className={s.partner} data-reveal>
            <div className={s.partnerTop}>
              <PartnerLogo name={p.name} kind={p.logo} />
              <span aria-hidden="true">↗</span>
            </div>
            <p className={s.eyebrow}>{p.role}</p>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </a>
        ))}
      </div>
      <a href={C.eventUrl} className={s.event} data-reveal>
        <PartnerLogo name={C.ethglobal} kind="ethglobal" />
        <div>
          <strong>{C.event}</strong>
          <p>{C.eventNote}</p>
        </div>
        <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
