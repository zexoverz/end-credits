// Owner settings (DESIGN §3 `owners`): USDC strings at the edge, micro-USDC in the table.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { owners } from "../db/schema";
import { formatUsdc, parseUsdc, USDC_PATTERN } from "../money";

// Hold TTL bounds are the escrow's MIN_TTL and MAX_TTL (DESIGN §16).
export const TTL_MIN_SECONDS = 60;
export const TTL_MAX_SECONDS = 7 * 24 * 3600;

const MIN = BigInt(10_000); // 0.01 USDC, the dust floor
const usdc = (maxUsdc: number) =>
  z
    .string()
    .regex(USDC_PATTERN)
    .transform(parseUsdc)
    .refine((v) => v >= MIN && v <= BigInt(maxUsdc) * BigInt(1_000_000), `0.01 to ${maxUsdc} USDC`);

export const settingsInput = z
  .strictObject({
    sessionBudget: usdc(100).optional(),
    packageCap: usdc(100).optional(),
    dailyLimit: usdc(1000).optional(),
    holdTtlSeconds: z.number().int().min(TTL_MIN_SECONDS).max(TTL_MAX_SECONDS).optional(),
    settleMode: z.enum(["auto", "on_open"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "no settings");

export type SettingsInput = z.infer<typeof settingsInput>;

export interface SettingsView {
  sessionBudget: string;
  packageCap: string;
  dailyLimit: string;
  holdTtlSeconds: number;
  settleMode: string;
}

type OwnerRow = typeof owners.$inferSelect;

export const settingsView = (o: OwnerRow): SettingsView => ({
  sessionBudget: formatUsdc(o.sessionBudgetMicro),
  packageCap: formatUsdc(o.packageCapMicro),
  dailyLimit: formatUsdc(o.dailyLimitMicro),
  holdTtlSeconds: o.holdTtlSeconds,
  settleMode: o.settleMode,
});

export async function ownerRow(ownerId: string): Promise<OwnerRow | null> {
  const [row] = await db().select().from(owners).where(eq(owners.id, ownerId)).limit(1);
  return row ?? null;
}

export type UpdateResult = { ok: true; settings: SettingsView } | { ok: false; error: string };

/** Applies `input` over the stored row; the per-package cap may not exceed the session budget. */
export async function updateSettings(ownerId: string, input: SettingsInput): Promise<UpdateResult> {
  return db().transaction(async (tx) => {
    const [row] = await tx.select().from(owners).where(eq(owners.id, ownerId)).for("update");
    const next = {
      sessionBudgetMicro: input.sessionBudget ?? row.sessionBudgetMicro,
      packageCapMicro: input.packageCap ?? row.packageCapMicro,
      dailyLimitMicro: input.dailyLimit ?? row.dailyLimitMicro,
      holdTtlSeconds: input.holdTtlSeconds ?? row.holdTtlSeconds,
      settleMode: input.settleMode ?? row.settleMode,
    };
    if (next.packageCapMicro > next.sessionBudgetMicro) return { ok: false, error: "cap_over_budget" };
    const [updated] = await tx.update(owners).set(next).where(eq(owners.id, ownerId)).returning();
    return { ok: true, settings: settingsView(updated) };
  });
}
