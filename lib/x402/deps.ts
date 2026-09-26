// Production wiring for the x402 credit resource: Postgres, the public facilitator, env keys.
import { privateKeyToAccount } from "viem/accounts";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { readEnv } from "../env";
import { interceptaFromEnv } from "../intercepta/client";
import { drizzleScreenRepo } from "../intercepta/repo";
import { DEFAULT_FACILITATOR_URL } from "./constants";
import { drizzleCreditRepo } from "./repo";
import type { ServerDeps } from "./server";

let cached: ServerDeps | undefined;

const PAYER_NOTE = "eip155:84532 x402 payer";

export function defaultServerDeps(): ServerDeps {
  if (cached) return cached;
  const intercepta = interceptaFromEnv(drizzleScreenRepo());
  cached = {
    repo: drizzleCreditRepo(),
    facilitator: new HTTPFacilitatorClient({
      url: process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
    }),
    usdc: readEnv("USDC_ADDRESS"),
    receiptSigner: privateKeyToAccount(readEnv("RECEIPT_SIGNING_KEY") as `0x${string}`),
    // Mainnet screen of the Base Sepolia payer, cached 5 min like every address screen.
    screenPayer: (address) => intercepta.quickScan(address as `0x${string}`, PAYER_NOTE),
  };
  return cached;
}
