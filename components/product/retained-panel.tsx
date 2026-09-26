"use client";
import { useState, type ReactNode } from "react";
/** Mount on first visit; keep drafts and loaded data when the user switches away. */
export function RetainedPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active}>{visited || active ? children : null}</div>;
}
