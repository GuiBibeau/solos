import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveProfile } from "./credentials/store.js";
import { deriveWsUrl, elfaBaseUrl, jupiterBaseUrl, loadSolanaEnv } from "./env.js";
import { randomSeed, seedAddress, seedToPrivateKeyString } from "./surfnet/test-surfnet.js";

const MAIN_RPC = "http://127.0.0.1:8899";
const ALT_RPC = "http://127.0.0.1:8901";

/**
 * Seed a disposable local profile backed by a random-seed keypair file inside the fixture store,
 * and return the keypair path.
 * @param {Record<string, string>} store env with the store's SOLOS_CONFIG_DIR
 * @param {string} name profile name; the first saved becomes the store's default
 * @param {string} rpcUrl loopback RPC stored on the profile
 */
const seedLocalProfile = async (store, name, rpcUrl) => {
  const seed = randomSeed();
  const keypairPath = path.join(store.SOLOS_CONFIG_DIR, `${name}.json`);
  writeFileSync(keypairPath, await seedToPrivateKeyString(seed));
  saveProfile(store, {
    name,
    profile: {
      provider: "local",
      keypairPath,
      rpcUrl,
      wallet: { address: await seedAddress(seed) },
      createdAt: 1,
    },
  });
  return keypairPath;
};

/** @type {string} */
let emptyDir;
/** @type {string} */
let fixtureDir;
/** @type {string} */
let mainKeypair;
/** @type {string} */
let altKeypair;

/**
 * Test-owned credential stores. Every `loadSolanaEnv` call points `SOLOS_CONFIG_DIR` at one of
 * these, so resolution never falls back to the operator's real `~/.config/solos`, which keeps a
 * default wallet profile on QA machines. `emptyDir` stays credential-free; `fixtureDir` holds
 * two disposable local profiles whose keypairs are random-seed files inside the store itself.
 */
beforeAll(async () => {
  emptyDir = mkdtempSync(path.join(tmpdir(), "solos-env-empty-"));
  fixtureDir = mkdtempSync(path.join(tmpdir(), "solos-env-fixture-"));
  const store = { SOLOS_CONFIG_DIR: fixtureDir };
  mainKeypair = await seedLocalProfile(store, "qa-main", MAIN_RPC);
  altKeypair = await seedLocalProfile(store, "qa-alt", ALT_RPC);
});
afterAll(() => {
  rmSync(emptyDir, { recursive: true, force: true });
  rmSync(fixtureDir, { recursive: true, force: true });
});

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

describe("solana env profiles", () => {
  test("the fixture store's default profile resolves without any signer env", () => {
    const env = loadSolanaEnv({ SOLOS_CONFIG_DIR: fixtureDir });
    expect(env.profile).toBe("qa-main");
    expect(env.signer).toEqual({ kind: "keypairPath", path: mainKeypair });
    expect(env.rpcUrl).toBe(MAIN_RPC);
    expect(env.wsUrl).toBe("ws://127.0.0.1:8900");
  });

  test("SOLOS_PROFILE selects the named fixture profile", () => {
    const env = loadSolanaEnv({ SOLOS_CONFIG_DIR: fixtureDir, SOLOS_PROFILE: "qa-alt" });
    expect(env.profile).toBe("qa-alt");
    expect(env.signer).toEqual({ kind: "keypairPath", path: altKeypair });
    expect(env.rpcUrl).toBe(ALT_RPC);
    expect(env.wsUrl).toBe("ws://127.0.0.1:8902");
  });

  test("a SOLOS_PROFILE name missing from the store throws", () => {
    expect(() => loadSolanaEnv({ SOLOS_CONFIG_DIR: fixtureDir, SOLOS_PROFILE: "nope" })).toThrow(
      /not found/,
    );
  });

  test("explicit env wins over any fixture profile", () => {
    const env = loadSolanaEnv({
      SOLOS_CONFIG_DIR: fixtureDir,
      SOLOS_PROFILE: "qa-alt",
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.signer).toEqual({ kind: "privateKey", value: "x" });
    expect(env.rpcUrl).toBe(MAIN_RPC);
    expect(env.profile).toBeUndefined();
  });

  test("an empty store fails with the absent-profile error whatever the machine has", () => {
    expect(() => loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLANA_RPC_URL: MAIN_RPC })).toThrow(
      /solos login/,
    );
  });
});
