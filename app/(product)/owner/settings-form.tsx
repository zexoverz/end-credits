"use client";

import { useState } from "react";
import { Button, Card, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import {
  parseSettingsForm,
  settingsErrors,
  settingsToForm,
  type SettingsField,
  type SettingsForm as Form,
  type SettingsView,
} from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";

type Errors = Partial<Record<SettingsField, string>>;

const input = "w-full rounded border border-line bg-background px-2 py-1.5 text-sm";

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
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-xs text-refused">{error}</span>}
    </div>
  );
}

export function SettingsForm({ initial, onSaved }: { initial: SettingsView; onSaved: (s: SettingsView) => void }) {
  const [form, setForm] = useState<Form>(() => settingsToForm(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setStatus("idle");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseSettingsForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setStatus("saving");
    const r = await api<SettingsView>("/api/owner/settings", { method: "PUT", body: JSON.stringify(parsed.body) });
    if (!r.ok) {
      setStatus("idle");
      const fields = settingsErrors(r.body);
      setErrors(fields);
      if (Object.keys(fields).length === 0) setError(C.ERR_SAVE.replace("{error}", r.error));
      return;
    }
    setForm(settingsToForm(r.data));
    setStatus("saved");
    onSaved(r.data);
  }

  return (
    <Card title={C.SETTINGS}>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field id="budget" label={C.BUDGET} error={errors.sessionBudget}>
          <input id="budget" inputMode="decimal" className={input} value={form.sessionBudget} onChange={set("sessionBudget")} />
        </Field>
        <Field id="cap" label={C.CAP} error={errors.packageCap}>
          <input id="cap" inputMode="decimal" className={input} value={form.packageCap} onChange={set("packageCap")} />
        </Field>
        <Field id="daily" label={C.DAILY} error={errors.dailyLimit}>
          <input id="daily" inputMode="decimal" className={input} value={form.dailyLimit} onChange={set("dailyLimit")} />
        </Field>
        <Field id="ttl" label={C.TTL} error={errors.holdTtlSeconds} hint={C.TTL_HINT}>
          <input id="ttl" inputMode="numeric" className={input} value={form.holdTtlMinutes} onChange={set("holdTtlMinutes")} />
        </Field>
        <Field id="mode" label={C.SETTLE_MODE} error={errors.settleMode}>
          <select id="mode" className={input} value={form.settleMode} onChange={set("settleMode")}>
            <option value="on_open">{C.SETTLE_ON_OPEN}</option>
            <option value="auto">{C.SETTLE_AUTO}</option>
          </select>
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? C.SAVING : C.SAVE}
          </Button>
          {status === "saved" && <span className="text-sm text-paid">{C.SAVED}</span>}
        </div>
        {error && (
          <div className="sm:col-span-2">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
      </form>
    </Card>
  );
}
