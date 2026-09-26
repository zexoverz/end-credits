"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { CONTROL as C } from "@/lib/copy/control-room";
type Toast = { id: number; title: string; detail?: string };
const Context = createContext<(title: string, detail?: string) => void>(
  () => {},
);
export const useFeedback = () => useContext(Context);
export function SuccessMark() {
  return (
    <svg
      className="success-mark"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="18" />
      <path d="m11 20 6 6 13-14" pathLength="1" />
    </svg>
  );
}
function ToastItem({
  item,
  dismiss,
}: {
  item: Toast;
  dismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 8000);
    return () => clearTimeout(timer);
  }, [item.id, dismiss]);
  return (
    <div className="feedback-toast">
      <SuccessMark />
      <div>
        <strong>{item.title}</strong>
        {item.detail && <p>{item.detail}</p>}
      </div>
      <button onClick={() => dismiss(item.id)} aria-label={C.dismiss}>
        ×
      </button>
    </div>
  );
}
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback(
    (id: number) => setItems((old) => old.filter((x) => x.id !== id)),
    [],
  );
  return (
    <Context.Provider
      value={(title, detail) =>
        setItems((old) => [...old.slice(-2), { id: Date.now(), title, detail }])
      }
    >
      {children}
      <div className="feedback-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <ToastItem key={item.id} item={item} dismiss={dismiss} />
        ))}
      </div>
    </Context.Provider>
  );
}
export function ActionNotice({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "pending" | "info";
}) {
  return (
    <div className={`action-notice action-notice-${tone}`} role="status">
      {tone === "success" ? (
        <SuccessMark />
      ) : tone === "pending" ? (
        <span className="action-spinner" aria-hidden="true" />
      ) : (
        <span className="notice-dot" aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}
export function ExecutionSteps({
  steps,
  active,
}: {
  steps: readonly string[];
  active: number;
}) {
  return (
    <ol className="execution-steps" aria-label={C.reviewLabel}>
      {steps.map((step, i) => (
        <li
          key={step}
          data-state={i < active ? "done" : i === active ? "active" : "waiting"}
        >
          <span aria-hidden="true">{i < active ? "✓" : i + 1}</span>
          <p>{step}</p>
        </li>
      ))}
    </ol>
  );
}
