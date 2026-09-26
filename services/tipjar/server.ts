// Runs the tip jar on PORT (Railway sets it). `pnpm tipjar`.
//   env: HONEST_PAYTO, CLIPPER_PAYTO, USDC_ADDRESS, X402_FACILITATOR_URL (optional)
import { createServer } from "node:http";
import { getAddress, isAddress } from "viem";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { DEFAULT_FACILITATOR_URL } from "../../lib/x402/constants";
import { handleTip, type TipjarConfig } from "./handler";

function address(name: string): string {
  const value = process.env[name];
  if (!value || !isAddress(value, { strict: false })) throw new Error(`${name} must be an address`);
  return getAddress(value);
}

const cfg: TipjarConfig = {
  honestPayTo: address("HONEST_PAYTO"),
  clipperPayTo: address("CLIPPER_PAYTO"),
  usdc: address("USDC_ADDRESS"),
  facilitator: new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL }),
  log: (line) => console.log(line),
};

const port = Number(process.env.PORT || 8402);

createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `localhost:${port}`;
    // Railway terminates TLS; the public URL is https.
    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? "http";
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const out = await handleTip(new Request(`${proto}://${host}${req.url ?? "/"}`, { method: req.method, headers }), cfg);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (err) {
    console.error(`tipjar: ${err instanceof Error ? err.name : "error"}`);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal" }));
  }
}).listen(port, () => console.log(`tipjar listening on ${port}`));
