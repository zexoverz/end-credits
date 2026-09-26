"use client";
import { useId, useRef } from "react";
import Link from "next/link";
import { STUDIO as S } from "@/lib/copy/studio";
import { StudioArtwork } from "./artwork";
export function SetupGuide({ compact = false }: { compact?: boolean }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className={compact ? "studio-help-button" : "studio-primary"}
        onClick={() => dialog.current?.showModal()}
      >
        {compact ? S.help : S.connect}
        <span aria-hidden="true">{compact ? "?" : "↗"}</span>
      </button>
      <dialog
        aria-labelledby={titleId}
        ref={dialog}
        className="setup-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="setup-dialog-inner">
          <button
            className="dialog-close"
            aria-label={S.close}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
          <div className="setup-dialog-art">
            <StudioArtwork kind="agent" />
          </div>
          <h2 id={titleId}>{S.helpTitle}</h2>
          <p>{S.helpBody}</p>
          <ol>
            {S.setupSteps.map((step, i) => (
              <li key={step.title}>
                <span>{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <Link
                    href={step.href}
                    onClick={() => dialog.current?.close()}
                  >
                    {step.action} ↗
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </dialog>
    </>
  );
}
