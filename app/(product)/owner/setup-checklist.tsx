"use client";
import Link from "next/link";
import type { Onboarding } from "@/lib/owner/onboarding";
import { ONBOARDING as C, SETUP_STEPS } from "@/lib/copy/onboarding";
import { Button, ErrorBox } from "@/components/ui";
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
  const next = data?.steps.find((s) => s.id === data.next);
  const nextCopy = SETUP_STEPS.find((s) => s.id === next?.id);
  return (
    <section className="setup-itinerary" aria-labelledby="itinerary-title">
      <header>
        <div>
          <p className="setup-kicker">{C.checklist}</p>
          <h2 id="itinerary-title">
            {data && data.next === null ? C.completeTitle : C.guideTitle}
          </h2>
          <p>{C.checklistBody}</p>
        </div>
        <Button className="setup-refresh" onClick={onRefresh} disabled={busy}>
          {busy ? C.checking : C.check}
        </Button>
      </header>
      {error && (
        <ErrorBox>
          {C.checklistFailed} <span>{error}</span>
        </ErrorBox>
      )}
      {!data && !error && <p role="status">{C.checking}</p>}
      {data && (
        <>
          <div className="setup-next">
            <div className="setup-progress-number">
              <strong>
                {count}
                <small>/{data.steps.length}</small>
              </strong>
              <span>{C.progress}</span>
            </div>
            <div>
              <p className="setup-kicker">{data.next ? C.next : C.done}</p>
              <h3>{nextCopy?.title ?? C.completeTitle}</h3>
              <p>{data.next ? nextCopy?.body : C.completeBody}</p>
              {next?.detail && (
                <p className="setup-next-detail">{next.detail}</p>
              )}
            </div>
            <Link
              className="product-button"
              href={next?.href ?? nextCopy?.href ?? "/app"}
            >
              {nextCopy?.action ?? C.activity}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <ol className="setup-checkpoints">
            {data.steps.map((step, i) => {
              const copy = SETUP_STEPS.find((s) => s.id === step.id);
              return (
                <li
                  key={step.id}
                  data-done={step.done}
                  data-next={data.next === step.id}
                >
                  <Link
                    href={step.href ?? copy?.href ?? "/app/owner"}
                    aria-current={data.next === step.id ? "step" : undefined}
                  >
                    <span className="checkpoint-index">
                      {step.done ? "✓" : String(i + 1).padStart(2, "0")}
                    </span>
                    <strong>{copy?.title ?? step.id}</strong>
                    <small>
                      {step.done
                        ? C.done
                        : data.next === step.id
                          ? C.current
                          : C.todo}
                    </small>
                    {step.detail && (
                      <span className="checkpoint-detail">{step.detail}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
