import { describe, expect, it } from "vitest";
import { baseSepolia } from "viem/chains";
import { chainFromEnv, payerAccount, recorderAccount } from "./keys";

// Anvil's first two dev keys: public, never funded outside a local node.
const ANVIL_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const env = {
  BASE_SEPOLIA_RPC: "http://127.0.0.1:1",
  PAYER_PRIVATE_KEY: ANVIL_0,
  RECORDER_PRIVATE_KEY: ANVIL_1,
  USDC_ADDRESS: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  ESCROW_ADDRESS: "0x0000000000000000000000000000000000000001",
};

describe("keys", () => {
  it("derives the payer and recorder accounts", () => {
    expect(payerAccount(env).address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(recorderAccount(env).address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("names a missing key", () => {
    expect(() => payerAccount({ ...env, PAYER_PRIVATE_KEY: "" })).toThrow(
      "Missing required env: PAYER_PRIVATE_KEY",
    );
  });

  it("rejects a malformed key without echoing it", () => {
    const bad = "0xdeadbeefcafe";
    let message = "";
    try {
      recorderAccount({ ...env, RECORDER_PRIVATE_KEY: bad });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe("Invalid private key in env: RECORDER_PRIVATE_KEY");
    expect(message).not.toContain("deadbeef");
  });

  it("builds Base Sepolia clients bound to each key", () => {
    const ctx = chainFromEnv(env);
    expect(ctx.publicClient.chain?.id).toBe(baseSepolia.id);
    expect(ctx.payer.account.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(ctx.recorder.account.address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(ctx.escrow).toBe(env.ESCROW_ADDRESS);
    expect(ctx.usdc).toBe(env.USDC_ADDRESS);
  });
});
