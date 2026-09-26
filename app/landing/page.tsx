import type { Metadata } from "next";
import Link from "next/link";
import { WEBSITE as C } from "@/lib/copy/website";
import { REPO_URL, ESCROW_ADDRESS } from "@/lib/copy/landing";
import { addressUrl } from "@/lib/client/format";
import {
  Arrow,
  BrandMark,
  CreditsMachine,
  FolderArt,
  Spark,
} from "@/components/landing/artwork";
import {
  BudgetCard,
  LandingHeader,
  Outcomes,
  SetupTerminal,
  Workflow,
} from "@/components/landing/interactive";
import s from "./landing.module.css";

export const metadata: Metadata = {
  title: `${C.name} — ${C.eyebrow}`,
  description: C.description,
};

export default function LandingPage() {
  return (
    <div className={s.landing} id="top">
      <a className={s.skipLink} href="#main">
        {C.skip}
      </a>
      <LandingHeader />
      <main id="main" className={s.main}>
        <section className={s.hero}>
          <div className={s.illustrationCard}>
            <span className={s.eyebrow}>{C.artLabel}</span>
            <CreditsMachine className={s.machine} />
            <h2>
              {C.artTitle.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <span className={s.cardIndex} aria-hidden="true">
              001 — ∞
            </span>
          </div>
          <div className={s.mintCard}>
            <Spark className={s.spark} />
            <div>
              <h2>
                {C.mintTitle.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h2>
              <p>{C.mintNote}</p>
            </div>
          </div>
          <a href="#get-started" className={s.setupCard}>
            <span className={s.circleArrow}>
              <Arrow />
            </span>
            <h2>{C.setupShort}</h2>
            <p>{C.setupSub}</p>
          </a>
          <div className={s.heroHeading}>
            <p className={s.eyebrow}>
              <span className={s.liveDot} />
              {C.eyebrow}
            </p>
            <h1>
              {C.hero.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p className={s.heroIntro}>{C.intro}</p>
            <a href="#get-started" className={s.button}>
              {C.heroAction}
              <Arrow />
            </a>
            <p className={s.heroNote}>{C.heroNote}</p>
          </div>
          <div className={s.creditsCard}>
            <div className={s.creditsCardCopy}>
              <p className={s.eyebrow}>{C.example}</p>
              <h2>{C.rollTitle}</h2>
              <p>{C.rollSub}</p>
              <div className={s.miniIcons} aria-hidden="true">
                <span>✳</span>
                <span>{"{ }"}</span>
                <span>↗</span>
              </div>
            </div>
            <div className={s.receiptStack}>
              <div className={s.receiptBack} />
              <div className={s.receipt}>
                <div className={s.receiptHeading}>
                  <BrandMark />
                  <span>{C.name}</span>
                  <span>↗</span>
                </div>
                {C.rollPackages.map((name, i) => (
                  <div className={s.receiptRow} key={name}>
                    <span className={s.packageInitial}>{name.charAt(0)}</span>
                    <span>{name}</span>
                    <span
                      className={s.packageCheck}
                      aria-label={C.exampleStatus}
                    >
                      ✓
                    </span>
                    <span className={s.receiptNumber}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}
                <div className={s.receiptBottom}>
                  <span>{C.sessionDone}</span>
                  <span>✳</span>
                </div>
              </div>
              <div className={s.receiptToast}>
                <span className={s.check}>✓</span>
                <div>
                  {C.sessionDone}
                  <small>{C.sessionSub}</small>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className={s.partnerStrip}>
          <p>{C.strip}</p>
          <div>
            {C.partners.map((name, i) => (
              <span key={name} className={s.partner}>
                <strong>{name}</strong>
                <small>{C.partnerRoles[i]}</small>
              </span>
            ))}
          </div>
          <span className={s.network}>
            <span className={s.liveDot} />
            {C.network}
          </span>
        </div>
        <section className={s.section} id="how-it-works">
          <div className={s.sectionHeading}>
            <div>
              <p className={s.eyebrow}>{C.flowEyebrow}</p>
              <h2>
                {C.flowTitle.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h2>
            </div>
            <p className={s.body}>{C.flowBody}</p>
          </div>
          <Workflow />
          <div className={s.featureGrid}>
            <article className={s.integrationCard}>
              <h3>{C.connectionTitle}</h3>
              <p className={s.body}>{C.connectionSub}</p>
              <div className={s.chips}>
                {C.integrationChips.map((name, i) => (
                  <span key={name}>
                    <i aria-hidden="true">{["✳", "↗", "⌘", "$", "—"][i]}</i>
                    {name}
                  </span>
                ))}
              </div>
            </article>
            <BudgetCard />
            <article className={s.privacyCard}>
              <FolderArt />
              <h3>{C.privacy}</h3>
              <p className={s.body}>{C.privacyBody}</p>
              <span className={s.privacyDecoration} aria-hidden="true">
                ↳
              </span>
            </article>
          </div>
        </section>
        <section className={s.section} id="guardrails">
          <div className={s.sectionHeading}>
            <div>
              <p className={s.eyebrow}>{C.safeEyebrow}</p>
              <h2>
                {C.safeTitle.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h2>
            </div>
            <p className={s.body}>{C.safeBody}</p>
          </div>
          <Outcomes />
        </section>
        <section className={s.measurement} id="why">
          <div className={s.measurementCopy}>
            <p className={s.eyebrow}>{C.measurementEyebrow}</p>
            <h2>
              {C.measurementTitle.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p className={s.body}>{C.measurementBody}</p>
            <a href="#guardrails" className={s.textLink}>
              {C.reserveLink}
              <Arrow />
            </a>
          </div>
          <div className={s.measurementVisual}>
            <div className={s.measurementStats}>
              <div>
                <strong>{C.measurementNumber}</strong>
                <span>{C.measurementLabel}</span>
              </div>
              <div>
                <strong>{C.measurementOtherNumber}</strong>
                <span>{C.measurementOther}</span>
              </div>
            </div>
            <svg
              className={s.dotMatrix}
              viewBox="0 0 600 240"
              role="img"
              aria-label={C.measurementGrid}
            >
              {Array.from({ length: 1000 }, (_, i) => (
                <circle
                  key={i}
                  cx={(i % 50) * 12 + 6}
                  cy={Math.floor(i / 50) * 12 + 6}
                  r="2.8"
                  fill={i < 21 ? "#9bf6b8" : "#444640"}
                />
              ))}
            </svg>
            <p className={s.finePrint}>{C.measurementFootnote}</p>
          </div>
        </section>
        <section className={`${s.section} ${s.faq}`} id="questions">
          <div>
            <p className={s.eyebrow}>{C.faq}</p>
            <h2>
              {C.faqTitle.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <Spark className={s.faqSpark} />
          </div>
          <div>
            {C.faqs.map(({ q, a }, i) => (
              <details key={q} name="landing-faq">
                <summary>
                  <span className={s.faqNumber}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {q}
                  <span className={s.faqPlus} aria-hidden="true">
                    +
                  </span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={s.finalCta} id="get-started">
          <div>
            <p className={s.eyebrow}>{C.setupEyebrow}</p>
            <h2>
              {C.setupTitle.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p className={s.body}>{C.setupBody}</p>
            <div className={s.ctaActions}>
              <Link href="/owner" className={s.button}>
                {C.ownerKey}
                <Arrow />
              </Link>
              <a href={REPO_URL} className={s.textLink}>
                {C.clone}
                <Arrow />
              </a>
            </div>
          </div>
          <SetupTerminal />
        </section>
      </main>
      <footer className={s.footer}>
        <div className={s.footerTop}>
          <p>{C.footer}</p>
          <div>
            <a href={REPO_URL}>
              {C.github}
              <Arrow />
            </a>
            <a href={addressUrl(ESCROW_ADDRESS)}>
              {C.contract}
              <Arrow />
            </a>
            <a href="#top">
              {C.top}
              <Arrow />
            </a>
          </div>
        </div>
        <div className={s.footerWordmark} aria-hidden="true">
          {C.name}
          <BrandMark />
        </div>
        <div className={s.footerBottom}>
          <span>{C.footerNote}</span>
          <span>{C.network}</span>
        </div>
      </footer>
    </div>
  );
}
