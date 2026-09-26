"use client";
import { useState } from "react";
import Link from "next/link";
import { EXPERIENCE as C } from "@/lib/copy/experience";
import { BrandMark, Arrow } from "./artwork";
import s from "@/app/landing/landing.module.css";

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className={s.header}>
      <Link href="/landing" className={s.brand}>
        <BrandMark />
        {C.name}
      </Link>
      <button
        className={s.menu}
        aria-expanded={open}
        aria-controls="landing-nav"
        onClick={() => setOpen(!open)}
      >
        {open ? C.close : C.menu}
      </button>
      <nav
        id="landing-nav"
        aria-label={C.nav}
        className={`${s.nav} ${open ? s.navOpen : ""}`}
      >
        <a href="#how" onClick={() => setOpen(false)}>
          {C.how}
        </a>
        <a href="#why" onClick={() => setOpen(false)}>
          {C.why}
        </a>
        <a href={C.github}>{C.source}</a>
        <Link className={s.button} href="/app">
          {C.app}
          <Arrow />
        </Link>
      </nav>
    </header>
  );
}

export function Workflow() {
  const [active, setActive] = useState(0);
  const step = C.steps[active];
  return (
    <div className={s.workflow}>
      <div className={s.steps} role="group" aria-label={C.flowTabs}>
        {C.steps.map((item, i) => (
          <button
            key={item.label}
            aria-pressed={i === active}
            onClick={() => setActive(i)}
            className={i === active ? s.selectedStep : ""}
          >
            <span>{item.label}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
            <Arrow />
          </button>
        ))}
      </div>
      <div className={s.flowStage} aria-live="polite">
        <div key={active} className={s.flowWindow}>
          <div className={s.windowBar}>
            <span className={s.windowDots}>•••</span>
            <span>{step.screen}</span>
            <span>↗</span>
          </div>
          <div className={s.flowCode}>
            {step.lines.map((line, i) => (
              <p key={line}>
                <span>0{i + 1}</span>
                {line}
              </p>
            ))}
          </div>
          <div className={s.flowFoot}>
            <span className={s.statusDot} />
            {step.footer}
          </div>
        </div>
        <svg
          className={s.connector}
          viewBox="0 0 400 110"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M80 0v35q0 20 20 20h200q20 0 20 20v35M200 55v55"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="80" cy="5" r="4" fill="currentColor" />
          <circle cx="200" cy="102" r="5" fill="currentColor" />
          <circle cx="320" cy="102" r="5" fill="currentColor" />
        </svg>
        <div className={s.flowTags}>
          {C.packages.slice(0, 3).map((p) => (
            <span key={p.name}>{p.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SetupCommands() {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(C.commands.join("\n"));
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <div className={s.terminal}>
      <div className={s.terminalHeader}>
        <span>{C.terminalTitle}</span>
        <button onClick={copy}>
          {status === "copied" ? C.copied : C.copy}
        </button>
      </div>
      <pre>
        <code>{C.commands.join("\n")}</code>
      </pre>
      <p aria-live="polite">{status === "error" ? C.copyError : C.setupHint}</p>
    </div>
  );
}
