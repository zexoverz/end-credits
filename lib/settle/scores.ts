// Score and role per package from stored `usage` rows, with the DESIGN §5 weights and caps. The
// CLI already capped the counts; they are capped again here because the server trusts nothing.
import { CAP, SIGNALS, WEIGHT, type Role, type Signal } from "../attribution/types";

export type UsageRow = { packageName: string; signal: string; count: number };
export type Scored = { name: string; score: number; role: Role };

const STARRING = 3;
const ROLE_OF: Record<Signal, Role> = {
  dep_added: "featuring",
  import: "featuring",
  docs: "research",
  read: "thanks",
};

const isSignal = (s: string): s is Signal => (SIGNALS as readonly string[]).includes(s);

export function scoreUsage(rows: UsageRow[]): Scored[] {
  const weighted = new Map<string, Map<Signal, number>>();
  for (const r of rows) {
    if (!isSignal(r.signal) || r.count <= 0) continue;
    const bySignal = weighted.get(r.packageName) ?? new Map<Signal, number>();
    bySignal.set(r.signal, WEIGHT[r.signal] * Math.min(r.count, CAP[r.signal]));
    weighted.set(r.packageName, bySignal);
  }
  const scored = [...weighted].map(([name, bySignal]) => ({
    name,
    score: [...bySignal.values()].reduce((a, b) => a + b, 0),
    lead: leadSignal(bySignal),
  }));
  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  return scored.map((p, i) => ({
    name: p.name,
    score: p.score,
    role: i < STARRING ? "starring" : ROLE_OF[p.lead],
  }));
}

function leadSignal(bySignal: Map<Signal, number>): Signal {
  let lead: Signal = "read";
  let best = -1;
  for (const s of SIGNALS) {
    const w = bySignal.get(s) ?? 0;
    if (w > best) [lead, best] = [s, w];
  }
  return lead;
}
