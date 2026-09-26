"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { RetainedPanel } from "./retained-panel";
import { WORKSPACE as C } from "@/lib/copy/workspace";
export function ControlSheet({
  id,
  title,
  open,
  onClose,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="control-sheet"
      aria-labelledby={`sheet-${id}`}
      onCancel={onClose}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="control-sheet-heading">
        <div>
          <span>{C.ownerTitle}</span>
          <h2 id={`sheet-${id}`}>{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={C.close}>
          ×
        </button>
      </header>
      <div className="control-sheet-body">
        <RetainedPanel active={open}>{children}</RetainedPanel>
      </div>
    </dialog>
  );
}
