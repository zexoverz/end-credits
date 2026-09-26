"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STUDIO as S } from "@/lib/copy/studio";
import { sessionDestination } from "./session-link";
import { Button, ErrorBox } from "@/components/ui";
export function SessionOpen() {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const destination = sessionDestination(value);
    if ("error" in destination) {
      setError(true);
      return;
    }
    setError(false);
    router.push(destination.href);
  }
  return (
    <form className="session-open" onSubmit={submit}>
      <label htmlFor="session-open-input">{S.sessionLabel}</label>
      <div>
        <input
          id="session-open-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder={S.sessionPlaceholder}
          aria-invalid={error}
          required
        />
        <Button type="submit">
          {S.sessionSubmit}
          <span aria-hidden="true">↗</span>
        </Button>
      </div>
      {error ? <ErrorBox>{S.sessionInvalid}</ErrorBox> : <p>{S.sessionHint}</p>}
    </form>
  );
}
