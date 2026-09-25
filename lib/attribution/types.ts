// Shared attribution types and constants (DESIGN §5, SPEC §5.1).

export const SIGNALS = ["dep_added", "import", "docs", "read"] as const;
export type Signal = (typeof SIGNALS)[number];

export const WEIGHT = { dep_added: 5, import: 3, docs: 2, read: 1 } as const;
export const CAP = { dep_added: 1, import: 5, docs: 5, read: 10 } as const; // distinct items

export const MAX_PACKAGES = 200;

// One line of `~/.endcredits/sessions/<id>.jsonl`, written by `endcredits record` (DESIGN §4.3).
// `ps` carries the node_modules paths a single Bash command read (decisions.md, E1).
export type LedgerLine =
  | { t: "read"; p?: string; ps?: string[] }
  | { t: "code"; f: string; specs: string[] }
  | { t: "docs"; u: string }
  | { t: "add"; pkgs: string[] };

export interface SignalUse {
  count: number;
  evidence?: string[];
}

export type Role = "starring" | "featuring" | "research" | "thanks";

export interface PackageAttribution {
  name: string;
  version?: string;
  signals: Partial<Record<Signal, SignalUse>>;
  score: number;
  role: Role;
}
