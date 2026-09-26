"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EXPERIENCE as C } from "@/lib/copy/experience";
import { Button, ErrorBox } from "@/components/ui";
import { packageNameFrom } from "@/lib/client/claim";
export function PackageSearch() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (
      value.length > 214 ||
      !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(value) ||
      !packageNameFrom(value.split("/"))
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    router.push(
      `/app/npm/${value.split("/").map(encodeURIComponent).join("/")}`,
    );
  }
  return (
    <form onSubmit={submit} className="package-search">
      <label htmlFor="package-name">{C.searchLabel}</label>
      <div>
        <input
          id="package-name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setInvalid(false);
          }}
          placeholder={C.searchPlaceholder}
          autoComplete="off"
          aria-invalid={invalid}
        />
        <Button type="submit">
          {C.packageSearch} <span aria-hidden="true">↗</span>
        </Button>
      </div>
      {invalid && <ErrorBox>{C.searchInvalid}</ErrorBox>}
    </form>
  );
}
