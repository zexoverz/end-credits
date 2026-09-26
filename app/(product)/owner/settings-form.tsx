"use client";
import { useState, type ReactNode } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import { ActionNotice, useFeedback } from "@/components/product/feedback";
import { ControlArt } from "@/components/product/control-art";
import {
  parseSettingsForm,
  settingsErrors,
  settingsToForm,
  type SettingsField,
  type SettingsForm as Form,
  type SettingsView,
} from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";
import { CONTROL as U } from "@/lib/copy/control-room";
type Errors = Partial<Record<SettingsField, string>>;
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="control-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p id={`${id}-hint`}>{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="control-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function SettingsForm({
  initial,
  onSaved,
}: {
  initial: SettingsView;
  onSaved: (s: SettingsView) => void;
}) {
  const [form, setForm] = useState<Form>(() => settingsToForm(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const notify = useFeedback();
  const dirty =
    JSON.stringify(form) !== JSON.stringify(settingsToForm(initial));
  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm({ ...form, [k]: e.target.value });
      setStatus("idle");
      setErrors((old) => ({
        ...old,
        [k === "holdTtlMinutes" ? "holdTtlSeconds" : k]: undefined,
      }));
    };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setError(null);
    const parsed = parseSettingsForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setStatus("saving");
    const r = await api<SettingsView>("/api/owner/settings", {
      method: "PUT",
      body: JSON.stringify(parsed.body),
    });
    if (!r.ok) {
      setStatus("idle");
      const fields = settingsErrors(r.body);
      setErrors(fields);
      if (!Object.keys(fields).length)
        setError(C.ERR_SAVE.replace("{error}", r.error));
      return;
    }
    setForm(settingsToForm(r.data));
    setStatus("saved");
    onSaved(r.data);
    notify(U.savedTitle, U.savedDetail);
  }
  const moneyFields = [
    {
      id: "session-budget",
      key: "sessionBudget",
      label: C.BUDGET,
      hint: U.sessionHint,
    },
    { id: "cap", key: "packageCap", label: C.CAP, hint: U.capHint },
    { id: "daily", key: "dailyLimit", label: C.DAILY, hint: U.dailyHint },
  ] as const;
  return (
    <section className="budget-editor">
      <header>
        <div>
          <p className="control-eyebrow">{C.SETTINGS}</p>
          <h2>{U.budgetTitle}</h2>
          <p>{U.budgetBody}</p>
        </div>
        <ControlArt />
      </header>
      <form onSubmit={save} aria-busy={status === "saving"}>
        <fieldset disabled={status === "saving"}>
          <div className="money-fields">
            {moneyFields.map((f) => (
              <Field
                key={f.id}
                id={f.id}
                label={f.label}
                error={errors[f.key]}
                hint={f.hint}
              >
                <div className="money-input">
                  <input
                    id={f.id}
                    inputMode="decimal"
                    value={form[f.key]}
                    onChange={set(f.key)}
                    aria-invalid={!!errors[f.key]}
                    aria-describedby={`${f.id}-hint${errors[f.key] ? ` ${f.id}-error` : ""}`}
                  />
                  <span>{U.unit}</span>
                </div>
              </Field>
            ))}
          </div>
          <div className="control-schedule">
            <Field
              id="mode"
              label={U.timing}
              error={errors.settleMode}
              hint={U.modeHint}
            >
              <select
                id="mode"
                value={form.settleMode}
                onChange={set("settleMode")}
                aria-describedby="mode-hint"
              >
                <option value="on_open">{C.SETTLE_ON_OPEN}</option>
                <option value="auto">{C.SETTLE_AUTO}</option>
              </select>
            </Field>
            <Field
              id="ttl"
              label={C.TTL}
              error={errors.holdTtlSeconds}
              hint={`${U.holdHint} ${C.TTL_HINT}`}
            >
              <input
                id="ttl"
                inputMode="numeric"
                value={form.holdTtlMinutes}
                onChange={set("holdTtlMinutes")}
                aria-invalid={!!errors.holdTtlSeconds}
                aria-describedby={`ttl-hint${errors.holdTtlSeconds ? " ttl-error" : ""}`}
              />
            </Field>
          </div>
        </fieldset>
        {error && <ErrorBox>{error}</ErrorBox>}
        <footer className="control-save">
          <div>
            <i data-dirty={dirty} />
            <span>{dirty ? U.unsaved : U.upToDate}</span>
          </div>
          <div>
            {dirty && (
              <button
                type="button"
                className="control-reset"
                disabled={status === "saving"}
                onClick={() => {
                  setForm(settingsToForm(initial));
                  setErrors({});
                  setError(null);
                  setStatus("idle");
                }}
              >
                {U.discard}
              </button>
            )}
            <Button type="submit" disabled={status === "saving" || !dirty}>
              {status === "saving" ? C.SAVING : C.SAVE}
            </Button>
          </div>
        </footer>
        {status === "saved" && <ActionNotice>{U.savedDetail}</ActionNotice>}
      </form>
    </section>
  );
}
