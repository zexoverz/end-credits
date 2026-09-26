import type { CSSProperties } from "react";
import { STORY as C, INTEGRATIONS as P } from "@/lib/copy/product-story";
import { PartnerLogo } from "./partner-logo";
import s from "@/app/landing/technical.module.css";
function Icon({
  kind,
}: {
  kind: "agent" | "key" | "receipt" | "package" | "shield";
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "agent" ? (
        <>
          <path d="M12 20h40v30H12zM24 12h16M32 12v8M20 50v5m24-5v5M6 28v13m52-13v13" />
          <path d="m22 31 5 4-5 4m12 0h9" />
        </>
      ) : kind === "key" ? (
        <>
          <circle cx="24" cy="24" r="15" />
          <circle cx="24" cy="24" r="5" />
          <path d="m35 35 20 20m-8-8 7-7m-13 7 6-6" />
        </>
      ) : kind === "shield" ? (
        <>
          <path d="m32 7 21 8v18c0 13-13 22-21 26-8-4-21-13-21-26V15Z" />
          <path d="m21 31 8 8 15-18" />
        </>
      ) : kind === "receipt" ? (
        <>
          <path d="m16 5 8 4 8-4 8 4 8-4v54l-8-4-8 4-8-4-8 4Z" />
          <path d="M24 20h16m-16 9h16m-16 9 5 5 11-11" />
        </>
      ) : (
        <>
          <path d="m32 7 24 14v27L32 61 8 48V21Zm0 28L8 21m24 14 24-14M32 35v26M20 14l24 14v12" />
        </>
      )}
    </svg>
  );
}
function Pipe() {
  return (
    <div className={s.pipe} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}
export function StoryScene({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className={s.capture}>
        <div className={s.agentWindow}>
          <div className={s.windowTop}>
            <span className={s.agentAsterisk} aria-hidden="true">
              ✳
            </span>
            {C.capture.agent}
            <span aria-hidden="true">•••</span>
          </div>
          <div className={s.agentPrompt}>
            <Icon kind="agent" />
            <strong>{C.capture.task}</strong>
          </div>
          <code>{C.capture.package}</code>
          <div className={s.signalLines}>
            {C.capture.signals.map((x, i) => (
              <p key={x} style={{ "--i": i } as CSSProperties}>
                <i aria-hidden="true" />
                {x}
                <span aria-hidden="true">↗</span>
              </p>
            ))}
          </div>
        </div>
        <Pipe />
        <div className={s.hook}>
          <Icon kind="package" />
          <div>
            <strong>{C.capture.hook}</strong>
            <span>{C.capture.upload}</span>
          </div>
          <span className={s.check} aria-hidden="true">
            ✓
          </span>
        </div>
        <small className={s.localBadge}>{C.capture.local}</small>
      </div>
    );
  if (index === 1)
    return (
      <div className={s.allocation}>
        <div className={s.budgetCoin}>
          <span>{C.allocation.label}</span>
          <strong>
            {C.allocation.total}
            <small>{C.allocation.unit}</small>
          </strong>
          <p>{C.allocation.cap}</p>
        </div>
        <Pipe />
        <div className={s.scoreLedger}>
          {C.allocation.scores.map((p, i) => (
            <div
              className={s.scoreRow}
              key={p.name}
              style={{ "--i": i, "--share": `${p.width}%` } as CSSProperties}
            >
              <div>
                <span>{p.name}</span>
                <small>{p.score} ×</small>
                <strong>{p.amount}</strong>
              </div>
              <div className={s.scoreTrack}>
                <i />
              </div>
            </div>
          ))}
          <footer>
            {C.allocation.namespace}
            <span>{C.allocation.unit}</span>
          </footer>
        </div>
        <small className={s.sceneFoot}>{C.allocation.formula}</small>
      </div>
    );
  if (index === 2)
    return (
      <div className={s.screenScene}>
        <div className={s.walletChip}>
          <Icon kind="key" />
          <div>
            <span>{C.screen.wallet}</span>
            <code>{C.screen.address}</code>
          </div>
        </div>
        <Pipe />
        <div className={s.scanner}>
          <div className={s.scannerTop}>
            <PartnerLogo name={P.items[0].name} kind="intercepta" />
            <Icon kind="shield" />
          </div>
          <div className={s.scanBeam} aria-hidden="true" />
          {C.screen.checks.map((x, i) => (
            <p key={x} style={{ "--i": i } as CSSProperties}>
              <span>{x}</span>
              <span className={s.check} aria-hidden="true">
                ✓
              </span>
            </p>
          ))}
        </div>
        <div className={s.signatureGate}>
          <i aria-hidden="true">▣</i>
          <span>{C.screen.stored}</span>
        </div>
        <small className={s.sceneFoot}>{C.screen.note}</small>
      </div>
    );
  if (index === 3)
    return (
      <div className={s.routing}>
        <div className={s.decisionHub}>
          <Icon kind="shield" />
          <span>{C.routeLabel}</span>
        </div>
        <div className={s.branchLines} aria-hidden="true">
          <svg viewBox="0 0 600 70" preserveAspectRatio="none">
            <path d="M300 0V25H100v45M300 25v45m0-45h200v45" />
          </svg>
          <i />
          <i />
          <i />
        </div>
        <div className={s.routeCards}>
          {C.routes.map((r, i) => (
            <div
              key={r.name}
              data-tone={r.tone}
              style={{ "--i": i } as CSSProperties}
            >
              <span className={s.routeSymbol} aria-hidden="true">
                {["↗", "Ⅱ", "◷"][i]}
              </span>
              <strong>{r.name}</strong>
              <p>{r.path}</p>
              <small>{r.note}</small>
            </div>
          ))}
        </div>
        <small className={s.sceneFoot}>{C.routeFoot}</small>
      </div>
    );
  if (index === 4)
    return (
      <div className={s.resolveScene}>
        {[true, false].map((owner) => (
          <div className={s.resolveCard} key={String(owner)}>
            <div className={s.resolveHeader}>
              <Icon kind={owner ? "key" : "package"} />
              <span>{owner ? C.resolve.owner : C.resolve.maintainer}</span>
            </div>
            <h4>{owner ? C.resolve.ownerTitle : C.resolve.maintainerTitle}</h4>
            <ol>
              {(owner ? C.resolve.ownerSteps : C.resolve.maintainerSteps).map(
                (step, i) => (
                  <li key={step} style={{ "--i": i } as CSSProperties}>
                    <span>{i + 1}</span>
                    {step}
                  </li>
                ),
              )}
            </ol>
            <footer>
              {owner ? C.resolve.ownerEnd : C.resolve.maintainerEnd}
              <span aria-hidden="true">↗</span>
            </footer>
          </div>
        ))}
      </div>
    );
  return (
    <div className={s.receiptScene}>
      <div className={s.eventSource}>
        <PartnerLogo name={P.items[1].name} kind="curvegrid" />
        <span>{C.receipt.event}</span>
        <i aria-hidden="true" />
      </div>
      <Pipe />
      <div className={s.finalReceipt}>
        <header>
          <Icon kind="receipt" />
          <div>
            <span>{C.receipt.label}</span>
            <h4>{C.receipt.title}</h4>
          </div>
        </header>
        <div className={s.receiptTable}>
          <div>
            {C.receipt.head.map((h) => (
              <small key={h}>{h}</small>
            ))}
          </div>
          {C.receipt.rows.map((r, i) => (
            <div key={r.name} style={{ "--i": i } as CSSProperties}>
              <strong>{r.name}</strong>
              <span>{r.outcome}</span>
              <small>{r.evidence}</small>
            </div>
          ))}
        </div>
        <p>{C.receipt.foot}</p>
      </div>
    </div>
  );
}
