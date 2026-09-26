"use client";
import { useEffect, useRef, useState } from "react";
import { usePageMotion } from "./motion";
import { STORY as C } from "@/lib/copy/product-story";
import { StoryScene } from "./story-scenes";
import s from "@/app/landing/technical.module.css";

export function TechnicalFlow() {
  const { enabled, reduced, toggle } = usePageMotion();
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const running = enabled && !paused && visible && foreground;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.18 },
    );
    observer.observe(el);
    const visibility = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const current = C.chapters[chapter];
  return (
    <section className={s.section} id="how" aria-labelledby="story-title">
      <header className={s.heading} data-reveal>
        <div>
          <p className={s.eyebrow}>{C.eyebrow}</p>
          <h2 id="story-title">
            {C.title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
        </div>
        <p>{C.intro}</p>
      </header>
      <div
        className={s.theater}
        ref={stageRef}
        data-running={running}
        data-chapter={chapter}
      >
        <div className={s.toolbar}>
          <span>
            <i aria-hidden="true" />
            {C.example}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!enabled && !reduced) {
                toggle();
                setPaused(false);
              } else setPaused(!paused);
            }}
            disabled={reduced}
            aria-pressed={paused || !enabled}
            aria-label={paused || !enabled ? C.resume : C.pause}
          >
            <span aria-hidden="true">{paused || !enabled ? "▷" : "Ⅱ"}</span>
            {reduced ? C.reduced : paused ? C.resume : C.auto}
          </button>
        </div>
        <div className={s.stage}>
          <div className={s.narration} key={`copy-${chapter}`}>
            <div className={s.chapterNumber} aria-hidden="true">
              {String(chapter + 1).padStart(2, "0")}
              <span>/ 06</span>
            </div>
            <p className={s.eyebrow}>{current.scope}</p>
            <h3>{current.title}</h3>
            <p className={s.body}>{current.body}</p>
            <div className={s.proof}>
              <span aria-hidden="true">✓</span>
              {current.proof}
            </div>
            <p className={s.detail}>{current.detail}</p>
          </div>
          <div
            className={s.visual}
            key={`scene-${chapter}`}
            data-scene={chapter}
          >
            <StoryScene index={chapter} />
          </div>
        </div>
        <div className={s.chapters} role="group" aria-label={C.nav}>
          {C.chapters.map((c, i) => (
            <button
              type="button"
              key={c.name}
              aria-pressed={chapter === i}
              onClick={() => setChapter(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {c.name}
              <span className={s.chapterTrack} aria-hidden="true">
                {chapter === i && (
                  <i
                    key={chapter}
                    className={s.chapterProgress}
                    onAnimationEnd={(event) => {
                      if (event.target === event.currentTarget && running)
                        setChapter((value) => (value + 1) % C.chapters.length);
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className={s.below}>
        <p>{C.footer}</p>
        <a href={C.sourceUrl}>{C.source}</a>
      </div>
    </section>
  );
}
