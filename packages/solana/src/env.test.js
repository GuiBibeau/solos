import { describe, expect, test } from "bun:test";
import { deriveWsUrl, loadSolanaEnv } from "./env.js";

describe("solana env", () => {
  test("derives ws url: local port+1, remote same host", () => {
    expect(deriveWsUrl("http://127.0.0.1:8899")).toBe("ws://127.0.0.1:8900");
    expect(deriveWsUrl("https://mainnet.helius-rpc.com/?api-key=x")).toBe(
      "wss://mainnet.helius-rpc.com/?api-key=x",
    );
  });

  test("requires exactly one signer source", () => {
    expect(() => loadSolanaEnv({ SOLANA_RPC_URL: "http://127.0.0.1:8899" })).toThrow();
    expect(() =>
      loadSolanaEnv({
        SOLANA_RPC_URL: "http://127.0.0.1:8899",
        SOLOS_SIGNER_PRIVATE_KEY: "x",
        SOLOS_SIGNER_KEYPAIR_PATH: "y",
      }),
    ).toThrow();
    expect(
      loadSolanaEnv({
        SOLANA_RPC_URL: "http://127.0.0.1:8899",
        SOLOS_SIGNER_KEYPAIR_PATH: "/k.json",
      }),
    ).toEqual({
      rpcUrl: "http://127.0.0.1:8899",
      wsUrl: "ws://127.0.0.1:8900",
      signer: { kind: "keypairPath", path: "/k.json" },
      executor: "direct",
    });
  });

  test("has no default rpc url", () => {
    expect(() => loadSolanaEnv({ SOLOS_SIGNER_PRIVATE_KEY: "x" })).toThrow(/SOLANA_RPC_URL/);
  });
});
