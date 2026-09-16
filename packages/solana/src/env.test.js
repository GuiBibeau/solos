import { describe, expect, test } from "bun:test";
import { deriveWsUrl, elfaBaseUrl, loadSolanaEnv } from "./env.js";

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
      elfa: { apiKey: undefined, baseUrl: "https://api.elfa.ai" },
    });
  });

  test("has no default rpc url", () => {
    expect(() => loadSolanaEnv({ SOLOS_SIGNER_PRIVATE_KEY: "x" })).toThrow(/SOLANA_RPC_URL/);
  });

  test("elfa key is optional and the base url defaults to the production endpoint", () => {
    const env = loadSolanaEnv({
      SOLANA_RPC_URL: "http://127.0.0.1:8899",
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.elfa).toEqual({ apiKey: undefined, baseUrl: "https://api.elfa.ai" });
    const withKey = loadSolanaEnv({
      SOLANA_RPC_URL: "http://127.0.0.1:8899",
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      ELFA_API_KEY: "elfa-key",
      ELFA_BASE_URL: "https://api.elfa.ai/",
    });
    expect(withKey.elfa).toEqual({ apiKey: "elfa-key", baseUrl: "https://api.elfa.ai" });
  });

  test("elfa base url allows plain http only on loopback hosts", () => {
    expect(elfaBaseUrl("http://127.0.0.1:8999")).toBe("http://127.0.0.1:8999");
    expect(elfaBaseUrl("http://localhost:8999/v1")).toBe("http://localhost:8999/v1");
    const OFF_LOOPBACK = "api.elfa.ai";
    expect(() => elfaBaseUrl(`http://${OFF_LOOPBACK}`)).toThrow(/ELFA_BASE_URL/);
    expect(() => elfaBaseUrl("ftp://api.elfa.ai")).toThrow(/ELFA_BASE_URL/);
  });
});
