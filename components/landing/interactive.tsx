"use client";

import { useState } from "react";
import Link from "next/link";
import { WEBSITE as C } from "@/lib/copy/website";
import { REPO_URL } from "@/lib/copy/landing";
import { Arrow, BrandMark, FolderArt, ShieldArt } from "./artwork";
import s from "@/app/landing/landing.module.css";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className={s.header}>
      <Link href="/landing" className={s.brand} aria-label={C.name}>
        <BrandMark />
        {C.name}
      </Link>
      <nav
        id="landing-navigation"
        aria-label={C.navigation}
        className={`${s.navigation} ${open ? s.navigationOpen : ""}`}
      >
        <a href="#how-it-works" onClick={() => setOpen(false)}>
          {C.how}
        </a>
        <a href="#why" onClick={() => setOpen(false)}>
          {C.why}
        </a>
        <a href={REPO_URL}>
          {C.github}
          <Arrow />
        </a>
      </nav>
      <div className={s.headerActions}>
        <Link href="/app" className={s.button}>
          {C.app}
          <Arrow />
        </Link>
        <button
          className={s.menu}
          aria-label={C.menu}
          aria-expanded={open}
          aria-controls="landing-navigation"
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}

export function Workflow() {
  const [step, setStep] = useState(0);
  const current = C.steps[step];
  return (
    <div className={s.workflow}>
      <div className={s.workflowCopy}>
        <div className={s.stepButtons} aria-label={C.workflowLabel}>
          {C.steps.map((item, i) => (
            <button
              key={item.tab}
              onClick={() => setStep(i)}
              aria-pressed={step === i}
              aria-controls="workflow-panel"
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item.tab}
            </button>
          ))}
        </div>
        <div id="workflow-panel" aria-live="polite">
          <p className={s.eyebrow}>{current.label}</p>
          <h3>{current.title}</h3>
          <p className={s.body}>{current.body}</p>
        </div>
        <a className={s.textLink} href="#get-started">
          {C.start}
          <Arrow />
        </a>
      </div>
      <div className={s.workflowStage}>
        <div className={s.terminalBack} aria-hidden="true">
          <div className={s.windowBar}>
            <i />
            <i />
            <i />
          </div>
          <FolderArt />
        </div>
        <div className={s.terminalFront}>
          <div className={s.windowBar}>
            <i />
            <i />
            <i />
            <span>{C.name}</span>
          </div>
          <div className={s.terminalLines} key={step}>
            {current.terminal.map((line, i) => (
              <p key={line} style={{ animationDelay: `${i * 100}ms` }}>
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className={s.workflowNotification}>
          <span className={s.check}>✓</span>
          {C.automation}
        </div>
        <span className={s.workflowCaption}>{C.workflowExample}</span>
      </div>
    </div>
  );
}

export function BudgetCard() {
  const [budget, setBudget] = useState(3);
  return (
    <article className={s.budgetCard}>
      <p className={s.eyebrow}>{C.budgetLabel}</p>
      <h3>{C.budgetTitle}</h3>
      <div className={s.budgetNumber}>
        <output htmlFor="landing-budget">{budget.toFixed(2)}</output>
        <span>{C.budgetUnit}</span>
      </div>
      <input
        id="landing-budget"
        type="range"
        min="1"
        max="10"
        step="0.5"
        value={budget}
        aria-label={C.budgetSlider}
        onChange={(e) => setBudget(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, #1a1c19 ${((budget - 1) / 9) * 100}%, #c9d2bf ${((budget - 1) / 9) * 100}%)`,
        }}
      />
      <p className={s.finePrint}>{C.budgetExample}</p>
      <Link className={s.textLink} href="/owner">
        {C.budgetAction}
        <Arrow />
      </Link>
    </article>
  );
}

export function Outcomes() {
  const [index, setIndex] = useState(0);
  const selected = C.outcomes[index];
  return (
    <div className={s.outcomeModule}>
      <div className={s.outcomeButtons} aria-label={C.outcomeTabs}>
        {C.outcomes.map((item, i) => (
          <button
            key={item.id}
            onClick={() => setIndex(i)}
            aria-pressed={index === i}
            aria-controls="outcome-panel"
            data-outcome={item.id}
          >
            <span aria-hidden="true">{item.symbol}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div id="outcome-panel" className={s.outcomePanel} aria-live="polite">
        <div className={s.outcomeArt}>
          <ShieldArt state={selected.id} />
        </div>
        <div key={selected.id} className={s.outcomeCopy}>
          <p className={s.eyebrow}>{selected.note}</p>
          <h3>{selected.heading}</h3>
          <p className={s.body}>{selected.body}</p>
          <Link href="/history" className={s.textLink}>
            {C.history}
            <Arrow />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SetupTerminal() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(C.setupCommands.join("\n"));
      setCopied(true);
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <div className={s.setupTerminal}>
      <div className={s.setupTerminalTop}>
        <span>{C.setupTerminal}</span>
        <button onClick={copy}>
          {copied ? C.copied : C.copy}
          <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
        </button>
      </div>
      <pre tabIndex={0}>
        <code>
          {C.setupCommands.map((command, i) => (
            <span key={command}>
              <i aria-hidden="true">{String(i + 1).padStart(2, "0")}</i>
              {command}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <p className={s.setupHint} role="status">
        {error ? C.copyError : copied ? C.copied : C.setupHint}
      </p>
    </div>
  );
}
