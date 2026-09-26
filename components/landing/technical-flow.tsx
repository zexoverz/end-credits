"use client";
import { useEffect, useState } from "react";
import { TECHNICAL as T } from "@/lib/copy/technical";
import s from "@/app/landing/technical.module.css";
function PipelineIcon({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {index === 0 ? (
        <>
          <rect x="7" y="10" width="34" height="28" rx="5" />
          <path d="M7 18h34m-25 7 5 4-5 4m10 0h7M13 14h1m4 0h1" />
        </>
      ) : index === 1 ? (
        <>
          <circle cx="11" cy="12" r="5" />
          <circle cx="37" cy="12" r="5" />
          <circle cx="24" cy="36" r="6" />
          <path d="m14 16 7 14m13-14-7 14M18 12h12M24 7v10m-5-5h10" />
        </>
      ) : index === 2 ? (
        <>
          <path d="m24 6 15 6v13c0 9-10 15-15 18-5-3-15-9-15-18V12Z" />
          <path d="m17 23 5 5 10-12" />
        </>
      ) : index === 3 ? (
        <>
          <circle cx="17" cy="19" r="10" />
          <circle cx="17" cy="19" r="3" />
          <path d="m25 26 14 14m-5-5 5-5m-10 0 5-5M32 7l2-4m6 11 5-1" />
        </>
      ) : (
        <>
          <path d="M12 5h24v38l-4-3-4 3-4-3-4 3-4-3-4 3Z" />
          <path d="M18 14h12m-12 7h12m-12 9 4 4 8-8" />
        </>
      )}
    </svg>
  );
}
export function TechnicalFlow() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = T.stages[active];
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (active === T.stages.length - 1) setPlaying(false);
      else setActive((a) => a + 1);
    }, 4200);
    return () => clearTimeout(timer);
  }, [active, playing]);
  function run() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setActive(0);
    setPlaying(true);
  }
  return (
    <section className={s.section} id="how">
      <div className={s.heading}>
        <div>
          <p>{T.eyebrow}</p>
          <h2>
            {T.title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
        </div>
        <p>{T.body}</p>
      </div>
      <div className={s.theater}>
        <header className={s.toolbar}>
          <span>
            <i />
            {T.example}
          </span>
          <button onClick={run}>
            <span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>
            {playing ? T.pause : active === 4 ? T.replay : T.run}
          </button>
        </header>
        <div className={s.lanes}>
          <span>{T.local}</span>
          <span>{T.server}</span>
          <span>{T.chain}</span>
        </div>
        <div className={s.pipeline} role="group" aria-label={T.nav}>
          {T.stages.map((stage, i) => (
            <div
              key={stage.title}
              className={`${s.station} ${i <= active ? s.reached : ""} ${i === active ? s.current : ""}`}
            >
              <button
                aria-pressed={i === active}
                onClick={() => {
                  setPlaying(false);
                  setActive(i);
                }}
              >
                <PipelineIcon index={i} />
                <span>{stage.title}</span>
                <small>{String(i + 1).padStart(2, "0")}</small>
              </button>
              {i < 4 && (
                <div className={s.rail}>
                  {playing && i === active && <span className={s.packet} />}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={s.traceBody}>
          <div className={s.explanation} key={`explanation-${active}`}>
            <p className={s.stageLabel}>{stage.label}</p>
            <h3>{stage.heading}</h3>
            <p>{stage.body}</p>
            <p className={s.detail}>{stage.detail}</p>
            <div className={s.checkpoint}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z" />
                <path d="M12 14v3" />
              </svg>
              <span>{stage.checkpoint}</span>
            </div>
          </div>
          <div className={s.traceWindow} key={`window-${active}`}>
            <div className={s.windowHeader}>
              <span aria-hidden="true">•••</span>
              <p>{stage.codeTitle}</p>
              <span aria-hidden="true">↗</span>
            </div>
            <div className={s.code}>
              {stage.code.map((line, i) => (
                <div key={i} style={{ animationDelay: `${i * 0.09}s` }}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <code>{line || " "}</code>
                </div>
              ))}
            </div>
            <div className={s.windowFooter}>
              <span className={s.stateLight} />
              {stage.tag}
              <span aria-hidden="true">✓</span>
            </div>
          </div>
        </div>
        <footer className={s.traceFooter}>
          <p aria-live="polite">
            {stage.title}
            <span> / </span>
            {T.gate}
          </p>
          <button
            disabled={active === 4}
            onClick={() => {
              setPlaying(false);
              setActive((a) => Math.min(a + 1, 4));
            }}
            aria-label={T.next}
          >
            →
          </button>
        </footer>
      </div>
      <div className={s.below}>
        <p>{T.footer}</p>
        <a href={T.sourceUrl}>{T.source}</a>
      </div>
    </section>
  );
}
