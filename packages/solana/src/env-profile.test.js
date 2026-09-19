import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveProfile } from "./credentials/store.js";
import { loadSolanaEnv } from "./env.js";
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
let fixtureDir;
/** @type {string} */
let mainKeypair;
/** @type {string} */
let altKeypair;

/**
 * Test-owned credential store with a disposable configured default: `qa-main` is saved first and
 * becomes the store's default, `qa-alt` is selected by name. Both keypairs are random-seed files
 * inside the store itself, so nothing on the machine's real `~/.config/solos` is ever read.
 */
beforeAll(async () => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), "solos-env-fixture-"));
  const store = { SOLOS_CONFIG_DIR: fixtureDir };
  mainKeypair = await seedLocalProfile(store, "qa-main", MAIN_RPC);
  altKeypair = await seedLocalProfile(store, "qa-alt", ALT_RPC);
});
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

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
});
