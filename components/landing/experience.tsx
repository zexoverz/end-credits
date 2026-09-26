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
