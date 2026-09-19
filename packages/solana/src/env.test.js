import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deriveWsUrl, elfaBaseUrl, jupiterBaseUrl, loadSolanaEnv } from "./env.js";

const MAIN_RPC = "http://127.0.0.1:8899";

/** @type {string} */
let emptyDir;

/**
 * Test-owned credential store. Every `loadSolanaEnv` call points `SOLOS_CONFIG_DIR` here, so
 * resolution never falls back to the operator's real `~/.config/solos`, which keeps a default
 * wallet profile on QA machines. The store stays credential-free: absent-profile assertions
 * must hold whatever the machine's login state is.
 */
beforeAll(() => {
  emptyDir = mkdtempSync(path.join(tmpdir(), "solos-env-empty-"));
});
afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));

describe("solana env", () => {
  test("derives ws url: local port+1, remote same host", () => {
    expect(deriveWsUrl("http://127.0.0.1:8899")).toBe("ws://127.0.0.1:8900");
    expect(deriveWsUrl("https://mainnet.helius-rpc.com/?api-key=x")).toBe(
      "wss://mainnet.helius-rpc.com/?api-key=x",
    );
  });

  test("requires exactly one signer source", () => {
    // Empty fixture store: must throw even when the machine has a real default profile.
    expect(() => loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLANA_RPC_URL: MAIN_RPC })).toThrow();
    expect(() =>
      loadSolanaEnv({
        SOLOS_CONFIG_DIR: emptyDir,
        SOLANA_RPC_URL: MAIN_RPC,
        SOLOS_SIGNER_PRIVATE_KEY: "x",
        SOLOS_SIGNER_KEYPAIR_PATH: "y",
      }),
    ).toThrow();
    expect(
      loadSolanaEnv({
        SOLOS_CONFIG_DIR: emptyDir,
        SOLANA_RPC_URL: MAIN_RPC,
        SOLOS_SIGNER_KEYPAIR_PATH: "/k.json",
      }),
    ).toEqual({
      rpcUrl: MAIN_RPC,
      wsUrl: "ws://127.0.0.1:8900",
      signer: { kind: "keypairPath", path: "/k.json" },
      executor: "direct",
      elfa: { apiKey: undefined, baseUrl: "https://api.elfa.ai" },
      jupiter: { apiKey: undefined, baseUrl: "https://api.jup.ag" },
    });
  });

  test("has no default rpc url", () => {
    expect(() =>
      loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLOS_SIGNER_PRIVATE_KEY: "x" }),
    ).toThrow(/SOLANA_RPC_URL/);
  });

  test("an empty store fails with the absent-profile error whatever the machine has", () => {
    expect(() => loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLANA_RPC_URL: MAIN_RPC })).toThrow(
      /solos login/,
    );
  });

  test("elfa key is optional and the base url defaults to the production endpoint", () => {
    const env = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.elfa).toEqual({ apiKey: undefined, baseUrl: "https://api.elfa.ai" });
    const withKey = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      ELFA_API_KEY: "elfa-key",
      ELFA_BASE_URL: "https://api.elfa.ai/",
    });
    expect(withKey.elfa).toEqual({ apiKey: "elfa-key", baseUrl: "https://api.elfa.ai" });

    const fromBlankExample = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      ELFA_API_KEY: "",
      ELFA_BASE_URL: "",
    });
    expect(fromBlankExample.elfa).toEqual({
      apiKey: undefined,
      baseUrl: "https://api.elfa.ai",
    });
  });

  test("elfa base url allows plain http only on loopback hosts", () => {
    expect(elfaBaseUrl("http://127.0.0.1:8999")).toBe("http://127.0.0.1:8999");
    expect(elfaBaseUrl("http://localhost:8999/v1")).toBe("http://localhost:8999/v1");
    const OFF_LOOPBACK = "api.elfa.ai";
    expect(() => elfaBaseUrl(`http://${OFF_LOOPBACK}`)).toThrow(/ELFA_BASE_URL/);
    expect(() => elfaBaseUrl("ftp://api.elfa.ai")).toThrow(/ELFA_BASE_URL/);
  });

  test("jupiter key is optional and the base url defaults to the production endpoint", () => {
    const env = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.jupiter).toEqual({ apiKey: undefined, baseUrl: "https://api.jup.ag" });
    const withKey = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      JUPITER_API_KEY: "jup-key",
      JUPITER_BASE_URL: "https://api.jup.ag/",
    });
    expect(withKey.jupiter).toEqual({ apiKey: "jup-key", baseUrl: "https://api.jup.ag" });
    const fromBlankExample = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      JUPITER_API_KEY: "",
      JUPITER_BASE_URL: "",
    });
    expect(fromBlankExample.jupiter).toEqual({
      apiKey: undefined,
      baseUrl: "https://api.jup.ag",
    });
  });

  test("jupiter base url allows plain http only on loopback hosts", () => {
    expect(jupiterBaseUrl("http://127.0.0.1:8999")).toBe("http://127.0.0.1:8999");
    expect(jupiterBaseUrl("http://localhost:8999/")).toBe("http://localhost:8999");
    const OFF_LOOPBACK = "api.jup.ag";
    expect(() => jupiterBaseUrl(`http://${OFF_LOOPBACK}`)).toThrow(/JUPITER_BASE_URL/);
    expect(() => jupiterBaseUrl("ftp://api.jup.ag")).toThrow(/JUPITER_BASE_URL/);
  });
});
