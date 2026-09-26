// Response shapes from the Intercepta OpenAPI docs (decisions.md, E4). Only the fields we read are
// required; unknown trait names and detector codes pass through as strings.
import { z } from "zod";

const Detector = z.object({ code: z.string(), description: z.string() });

// GET /api/public/v2/extension/account/{address}/quick-scan -> ToxicScoreShortResponseV2
export const QuickScan = z.object({
  toxicScore: z.number(),
  traits: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      risk: z.number().optional(),
      txsCount: z.number().optional(),
    }),
  ),
  // Set by the client, never by Intercepta: the no-history 404 (./no-history.ts).
  noHistory: z.literal(true).optional(),
});

// GET /api/public/v2/extension/token-intelligence/token/{address}/risks -> TokenRiskAnalysisV2Response
export const TokenRisks = z.object({
  action: z.enum(["block", "warn", "info"]),
  riskLevel: z.string(),
  riskScore: z.number().optional(),
  detectors: z.array(Detector),
});

// POST /api/public/v1/extension/simulation/transaction -> DebugTransactionShortResponse
export const Simulation = z.object({
  detectors: z.array(Detector),
  assetsMovement: z.unknown().optional(),
  transactionType: z.string().optional(),
});

// GET /api/public/v1/extension/poisoning-attack/check-address/{address} -> PoisoningCheck
export const Impersonation = z.object({
  isAddressPoisoned: z.boolean(),
  originalAddress: z.string().nullish(),
});

export type QuickScanResult = z.infer<typeof QuickScan>;
export type TokenRisksResult = z.infer<typeof TokenRisks>;
export type SimulationResult = z.infer<typeof Simulation>;
export type ImpersonationResult = z.infer<typeof Impersonation>;
