// Production wiring for the x402 credit resource: Postgres, the public facilitator, env keys.
import { privateKeyToAccount } from "viem/accounts";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { readEnv } from "../env";
import { DEFAULT_FACILITATOR_URL } from "./constants";
import { drizzleCreditRepo } from "./repo";
import type { ServerDeps } from "./server";

let cached: ServerDeps | undefined;

export function defaultServerDeps(): ServerDeps {
  cached ??= {
    repo: drizzleCreditRepo(),
    facilitator: new HTTPFacilitatorClient({
      url: process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
    }),
    usdc: readEnv("USDC_ADDRESS"),
    receiptSigner: privateKeyToAccount(readEnv("RECEIPT_SIGNING_KEY") as `0x${string}`),
  };
  return cached;
}
