// Body of `POST /api/sessions` (DESIGN §6.1): names by the §5 npm rule, counts within the caps,
// at most 200 packages, each package once.
import { z } from "zod";
import { isValidPackageName } from "../attribution/specifier";
import { CAP, MAX_PACKAGES, type Signal } from "../attribution/types";
import { declaredRepository, isHttpsUrl, MAX_DIRECTORY_CHARS, MAX_URL_CHARS } from "../registry/declared";

const MAX_EVIDENCE_CHARS = 512;

const signalUse = (signal: Signal) =>
  z.strictObject({
    count: z.number().int().min(1).max(CAP[signal]),
    evidence: z.array(z.string().min(1).max(MAX_EVIDENCE_CHARS)).max(CAP[signal]).optional(),
  });

const signals = z
  .strictObject({
    dep_added: signalUse("dep_added").optional(),
    import: signalUse("import").optional(),
    docs: signalUse("docs").optional(),
    read: signalUse("read").optional(),
  })
  .refine((s) => Object.values(s).some(Boolean), "no signals");

// From the installed package.json, used only when the npm registry has no document for the name.
const repository = z
  .union([
    z.string().max(MAX_URL_CHARS),
    z.strictObject({
      type: z.string().max(32).optional(),
      url: z.string().max(MAX_URL_CHARS),
      directory: z.string().max(MAX_DIRECTORY_CHARS).optional(),
    }),
  ])
  .refine((r) => declaredRepository(r) !== null, "repository must name a GitHub owner/repo");

const packageUse = z.strictObject({
  name: z.string().refine(isValidPackageName, "invalid npm package name"),
  version: z.string().min(1).max(64).optional(),
  repository: repository.optional(),
  homepage: z.string().max(MAX_URL_CHARS).refine(isHttpsUrl, "homepage must be an https URL").optional(),
  signals,
});

export const uploadSchema = z.strictObject({
  claudeSessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  repoLabel: z.string().min(1).max(100).optional(),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  packages: z
    .array(packageUse)
    .max(MAX_PACKAGES)
    .refine((ps) => new Set(ps.map((p) => p.name)).size === ps.length, "duplicate package"),
});

export type UploadInput = z.infer<typeof uploadSchema>;
