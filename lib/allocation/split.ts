// Budget split (DESIGN §7.1): proportional to score, water-filled under a per-package cap, in
// micro-USDC bigints. The daily limit is applied by the caller before `budget` is passed in.

export const DUST_FLOOR = 10_000n; // 0.01 USDC

export type Share = { amount: bigint; capped: boolean; dust: boolean };

export function split(
  scores: Map<string, number>,
  budget: bigint,
  cap: bigint,
): Map<string, Share> {
  if (budget < 0n || cap < 0n) throw new Error("split: budget and cap must be >= 0");
  for (const s of scores.values()) {
    if (!Number.isSafeInteger(s)) throw new Error(`split: score ${s} is not an integer`);
  }

  let active = [...scores].filter(([, s]) => s > 0).map(([k, s]) => [k, BigInt(s)] as const);
  const amounts = new Map<string, { amount: bigint; capped: boolean }>();
  let remaining = budget;

  while (active.length > 0) {
    const total = active.reduce((sum, [, s]) => sum + s, 0n);
    // exact comparison: remaining × score / total > cap, without flooring first
    const over = active.filter(([, s]) => remaining * s > cap * total);
    if (over.length === 0) {
      for (const [k, s] of active) amounts.set(k, { amount: (remaining * s) / total, capped: false });
      break;
    }
    for (const [k] of over) {
      amounts.set(k, { amount: cap, capped: true });
      remaining -= cap;
    }
    active = active.filter(([k]) => !amounts.has(k));
  }
  // If every package was capped, whatever is left in `remaining` stays unspent.

  const out = new Map<string, Share>();
  for (const [k, { amount, capped }] of amounts) {
    const dust = amount < DUST_FLOOR;
    out.set(k, { amount: dust ? 0n : amount, capped: dust ? false : capped, dust });
  }
  return out;
}
