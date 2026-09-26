// Store an uploaded session and its usage rows (DESIGN §6.1). Idempotent on
// (owner_id, claude_session_id): a re-upload returns the first id and writes nothing.
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { db } from "../db/client";
import { packages, sessions, usage } from "../db/schema";
import { packageKey } from "../payee/keys";
import { declaredRepository } from "../registry/declared";
import type { AgentKeyOwner } from "./auth";
import type { UploadInput } from "./schema";

export const sessionKeyFor = (id: string) => keccak256(stringToBytes(id));

async function existing(ownerId: string, claudeSessionId: string): Promise<string | null> {
  const [row] = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.ownerId, ownerId), eq(sessions.claudeSessionId, claudeSessionId)))
    .limit(1);
  return row?.id ?? null;
}

function usageRows(sessionId: string, input: UploadInput) {
  return input.packages.flatMap((p) =>
    Object.entries(p.signals)
      .filter(([, use]) => use)
      .map(([signal, use]) => ({
        sessionId,
        packageName: p.name,
        version: p.version ?? null,
        signal,
        count: use!.count,
        evidence: use!.evidence ?? [],
      })),
  );
}

// Repository and homepage from the uploader's package.json. The first declaration wins and is
// only read when the npm registry has no document (decisions.md, packages not on the registry).
function declaredRows(input: UploadInput) {
  return input.packages.flatMap((p) => {
    const repo = p.repository ? declaredRepository(p.repository) : null;
    if (!repo && !p.homepage) return [];
    return [
      {
        name: p.name,
        packageKey: packageKey(p.name),
        declaredRepo: repo?.fullName ?? null,
        declaredDirectory: repo?.directory ?? null,
        declaredHomepage: p.homepage ?? null,
      },
    ];
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function storeDeclared(tx: Tx, input: UploadInput): Promise<void> {
  const rows = declaredRows(input);
  if (rows.length === 0) return;
  await tx
    .insert(packages)
    .values(rows)
    .onConflictDoUpdate({
      target: [packages.ecosystem, packages.name],
      set: {
        declaredRepo: sql`excluded.declared_repo`,
        declaredDirectory: sql`excluded.declared_directory`,
        declaredHomepage: sql`coalesce(${packages.declaredHomepage}, excluded.declared_homepage)`,
      },
      setWhere: sql`${packages.declaredRepo} is null`,
    });
}

export async function ingestSession(
  key: AgentKeyOwner,
  input: UploadInput,
): Promise<{ id: string; created: boolean }> {
  const id = randomUUID();
  const inserted = await db().transaction(async (tx) => {
    const rows = await tx
      .insert(sessions)
      .values({
        id,
        ownerId: key.ownerId,
        agentKeyId: key.agentKeyId,
        claudeSessionId: input.claudeSessionId,
        sessionKey: sessionKeyFor(id),
        repoLabel: input.repoLabel ?? null,
        startedAt: input.startedAt ? new Date(input.startedAt) : null,
        endedAt: input.endedAt ? new Date(input.endedAt) : null,
        settleRequestedAt: key.settleMode === "auto" ? new Date() : null,
      })
      .onConflictDoNothing({ target: [sessions.ownerId, sessions.claudeSessionId] })
      .returning({ id: sessions.id });
    if (rows.length === 0) return false; // already uploaded (a retry or a concurrent upload)
    const values = usageRows(id, input);
    if (values.length > 0) await tx.insert(usage).values(values);
    await storeDeclared(tx, input);
    return true;
  });
  if (inserted) return { id, created: true };
  return { id: (await existing(key.ownerId, input.claudeSessionId))!, created: false };
}
