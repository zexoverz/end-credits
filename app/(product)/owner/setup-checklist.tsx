"use client";
import type { Onboarding } from "@/lib/owner/onboarding";
import { ONBOARDING as O, SETUP_STEPS } from "@/lib/copy/onboarding";
import { WORKSPACE as C } from "@/lib/copy/workspace";
import { ErrorBox } from "@/components/ui";
export function SetupChecklist({
  data,
  error,
  busy,
  onRefresh,
}: {
  data: Onboarding | null;
  error: string | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const count = data?.steps.filter((s) => s.done).length ?? 0;
  const next = data?.steps.find((s) => s.id === data.next),
    copy = SETUP_STEPS.find((s) => s.id === next?.id);
  return (
    <section className="setup-runway" aria-label={O.checklist}>
      {error ? (
        <ErrorBox>
          {O.checklistFailed} {error}
        </ErrorBox>
      ) : !data ? (
        <p role="status">{O.checking}</p>
      ) : (
        <>
          <div className="setup-runway-top">
            <div className="setup-film" aria-hidden="true">
              <svg
                viewBox="0 0 156 70"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M7 9h142v52H7z" />
                <path d="M7 20h142M7 50h142" />
                {data.steps.map((s, i) => (
                  <g key={s.id}>
                    <path d={`M${16 + i * 19} 14h7m-7 42h7`} />
                    <rect
                      x={14 + i * 19}
                      y="27"
                      width="13"
                      height="16"
                      rx="2"
                      fill={s.done ? "#242b22" : "#fff"}
                    />
                    {s.done && (
                      <path d={`m${17 + i * 19} 35 2 2 5-5`} stroke="#b1f1c6" />
                    )}
                  </g>
                ))}
              </svg>
              <span>
                {count}/{data.steps.length} {C.complete}
              </span>
            </div>
            <div className="setup-runway-copy">
              <span>{data.next ? C.setup : C.readyBody}</span>
              <h2>{copy?.title ?? C.ready}</h2>
              {data.next && <p>{copy?.body}</p>}
            </div>
            <a
              className="desk-solid-button"
              href={next?.href ?? copy?.href ?? "/app"}
            >
              {copy?.action ?? C.activity} <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="setup-runway-bottom">
            <details>
              <summary>
                {C.setupDetail}
                <span aria-hidden="true">+</span>
              </summary>
              <ol className="setup-checkpoints-compact">
                {data.steps.map((s, i) => {
                  const c = SETUP_STEPS.find((k) => k.id === s.id);
                  return (
                    <li
                      key={s.id}
                      data-done={s.done}
                      data-next={s.id === data.next}
                    >
                      <a
                        href={s.href ?? c?.href ?? "/app/owner"}
                        aria-current={s.id === data.next ? "step" : undefined}
                      >
                        <span>
                          {s.done ? "✓" : String(i + 1).padStart(2, "0")}
                        </span>
                        <strong>{c?.title}</strong>
                        <small>{s.detail ?? (s.done ? O.done : O.todo)}</small>
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </details>
            <button type="button" disabled={busy} onClick={onRefresh}>
              {busy ? O.checking : C.refresh} <span aria-hidden="true">↻</span>
            </button>
          </div>
        </>
      )}
      {error && (
        <button type="button" disabled={busy} onClick={onRefresh}>
          {C.refresh}
        </button>
      )}
    </section>
  );
}
