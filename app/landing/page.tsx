import Link from "next/link";
import { EXPERIENCE as C } from "@/lib/copy/experience";
import { WEBSITE as W } from "@/lib/copy/website";
import { Arrow, BrandMark } from "@/components/landing/artwork";
import {
  Header,
  Workflow,
  SetupCommands,
} from "@/components/landing/experience";
import s from "./landing.module.css";

function LineArt({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "shield" ? (
        <>
          <path d="m50 12 30 12v24c0 20-18 33-30 40-12-7-30-20-30-40V24Z" />
          <path d="m36 48 10 11 20-24" />
          <path d="m12 9 3 7M84 78l7 4M9 60l7-2" />
        </>
      ) : kind === "budget" ? (
        <>
          <rect x="15" y="27" width="70" height="51" rx="9" />
          <path d="M20 27V17h54v10M64 45h21v18H64a9 9 0 0 1 0-18Z" />
          <circle cx="69" cy="54" r="2" />
          <path d="M30 44v16M24 52h12M25 87h48" />
        </>
      ) : (
        <>
          <path d="m50 12 33 18v39L50 88 17 69V30Zm0 38L17 30m33 20 33-20M50 50v38M33 21l33 19v16" />
          <path d="m7 13 5 5M87 11l-5 7M87 86l-4-5" />
        </>
      )}
    </svg>
  );
}
function AgentScene() {
  return (
    <div className={s.heroScene}>
      <span className={s.sceneLabel}>{C.example}</span>
      <svg
        className={s.sceneOrbit}
        viewBox="0 0 500 530"
        fill="none"
        aria-hidden="true"
      >
        <ellipse
          cx="250"
          cy="270"
          rx="220"
          ry="194"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <path
          d="M404 47v32m-16-16h32M76 429v24m-12-12h24"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <div className={s.agentCard}>
        <div className={s.agentName}>
          <span className={s.agentGlyph}>✳</span>
          {C.agent}
          <span className={s.agentCode}>⌘</span>
        </div>
        <p>{C.prompt}</p>
        <div className={s.agentMessage}>
          <span>↳</span>
          {C.agentDone}
        </div>
      </div>
      <div className={s.receiptCard}>
        <div className={s.receiptHeader}>
          <BrandMark />
          <span>{C.receipt}</span>
        </div>
        {C.packages.slice(0, 3).map((p) => (
          <div className={s.receiptRow} key={p.name}>
            <span className={s.packageMark}>{p.mark}</span>
            <strong>{p.name}</strong>
            <span>{p.role}</span>
            <span className={s.check}>✓</span>
          </div>
        ))}
        <p>{C.receiptNote}</p>
      </div>
      <div className={s.sceneBottom}>
        <span className={s.statusDot} />
        {W.sessionDone}
        <Arrow />
      </div>
    </div>
  );
}
export default function Landing() {
  return (
    <div className={s.site} id="top">
      <a href="#content" className={s.skip}>
        {C.skip}
      </a>
      <div className={s.wrap}>
        <Header />
        <main id="content">
          <section className={s.hero}>
            <div className={s.heroCopy}>
              <p className={s.eyebrow}>{C.eyebrow}</p>
              <h1>
                {C.hero.map((line, i) => (
                  <span key={line} className={i === 2 ? s.heroLast : undefined}>
                    {line}
                  </span>
                ))}
              </h1>
              <p className={s.intro}>{C.intro}</p>
              <div className={s.actions}>
                <a className={s.button} href="#setup">
                  {C.cta}
                  <Arrow />
                </a>
                <a className={s.textLink} href="#how">
                  {C.secondary}
                  <span>↓</span>
                </a>
              </div>
              <p className={s.footnote}>{C.footnote}</p>
            </div>
            <AgentScene />
          </section>
          <section className={s.ecosystem}>
            <div className={s.ecosystemIntro}>
              <h2>{C.packageHeading}</h2>
              <p>{C.packageBody}</p>
            </div>
            <div className={s.packageGrid}>
              {C.packages.map((p) => (
                <a href={p.url} key={p.name} className={s.project}>
                  <span className={s.projectMark}>{p.mark}</span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.role}</small>
                  </span>
                  <span className={s.projectArrow}>↗</span>
                </a>
              ))}
            </div>
            <p className={s.caption}>{C.packageNote}</p>
          </section>
          <section className={s.problem} id="why">
            <div className={s.sectionHeading}>
              <div>
                <p className={s.eyebrow}>{C.problemLabel}</p>
                <h2>
                  {C.problemTitle.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </h2>
              </div>
              <p>{C.problemBody}</p>
            </div>
            <div className={s.stats}>
              <article className={s.valueCard}>
                <span className={s.statNumber}>{C.value}</span>
                <h3>{C.valueTitle}</h3>
                <p>{C.valueBody}</p>
                <a href={C.valueUrl}>{C.valueSource}</a>
                <svg viewBox="0 0 230 180" fill="none" aria-hidden="true">
                  <path
                    d="M20 150 68 103l30 23 70-84 43 17M173 22l39 36-49 8"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M20 168h190M38 139v29m40-48v48m40-65v65m40-91v91m40-90v90"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </article>
              <article className={s.gapCard}>
                <div className={s.dotGrid} aria-hidden="true">
                  {Array.from({ length: 100 }, (_, i) => (
                    <span key={i} className={i < 2 ? s.filledDot : undefined} />
                  ))}
                </div>
                <span className={s.statNumber}>{C.gap}</span>
                <h3>{C.gapTitle}</h3>
                <p>{C.gapBody}</p>
                <a href={C.gapUrl}>{C.gapSource}</a>
                <small>{C.gapNote}</small>
              </article>
            </div>
          </section>
          <section className={s.flowSection} id="how">
            <div className={s.sectionHeading}>
              <div>
                <p className={s.eyebrow}>{C.flowLabel}</p>
                <h2>
                  {C.flowTitle.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </h2>
              </div>
              <p>{C.flowIntro}</p>
            </div>
            <Workflow />
          </section>
          <section className={s.controls}>
            <p className={s.eyebrow}>{C.controlsLabel}</p>
            <h2>{C.controlsTitle}</h2>
            <div className={s.controlGrid}>
              {C.controls.map((item) => (
                <article key={item.title}>
                  <LineArt kind={item.icon} />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            <div className={s.maintainer}>
              <div>
                <h3>{C.maintainer}</h3>
                <p>{C.maintainerBody}</p>
              </div>
              <Link className={s.buttonOutline} href="/app/packages">
                {C.maintainerAction}
                <Arrow />
              </Link>
            </div>
          </section>
          <section className={s.faq}>
            <h2>{W.faqTitle.join(" ")}</h2>
            <div>
              {W.faqs.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <span>+</span>
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>
          <section className={s.setup} id="setup">
            <div>
              <p className={s.eyebrow}>{C.setupLabel}</p>
              <h2>
                {C.setupTitle.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </h2>
              <p>{C.setupBody}</p>
              <Link href="/app/owner" className={s.button}>
                {C.setupAction}
                <Arrow />
              </Link>
              <a href={C.github} className={s.setupSource}>
                {C.source} ↗
              </a>
            </div>
            <SetupCommands />
          </section>
        </main>
        <footer className={s.footer}>
          <div>
            <Link className={s.brand} href="/landing">
              <BrandMark />
              {C.name}
            </Link>
            <p>{C.footer}</p>
          </div>
          <p>{C.footerNote}</p>
          <a href="#top">↑ {W.top}</a>
        </footer>
      </div>
    </div>
  );
}
