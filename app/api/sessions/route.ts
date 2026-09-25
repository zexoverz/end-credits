// POST /api/sessions: the CLI uploads one attributed session (DESIGN §6.1).
import { readEnv } from "@/lib/env";
import { bearerToken, ownerForAgentKey } from "@/lib/sessions/auth";
import { ingestSession } from "@/lib/sessions/ingest";
import { uploadSchema } from "@/lib/sessions/schema";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 2_000_000;

const error = (status: number, code: string) => Response.json({ error: code }, { status });

export async function POST(req: Request): Promise<Response> {
  const token = bearerToken(req);
  const key = token ? await ownerForAgentKey(token) : null;
  if (!key) return error(401, "unauthorized");

  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return error(413, "too_large");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return error(400, "invalid_json");
  }
  const parsed = uploadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const { id, created } = await ingestSession(key, parsed.data);
  const url = `${readEnv("APP_URL").replace(/\/$/, "")}/credits/${id}`;
  return Response.json({ id, url }, { status: created ? 201 : 200 });
}
