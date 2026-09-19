import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getBalances } from "@solos/core";
import { Effect } from "effect";
import { saveProfile } from "./credentials/store.js";
import { loadSolanaEnv } from "./env.js";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "./surfnet/test-surfnet.js";
import { SolanaLive } from "./index.js";

const EXPLICIT_RPC = "http://127.0.0.1:8899";

/**
 * Seed a disposable local profile backed by a random-seed keypair file inside the fixture store,
 * and return the keypair path and address.
 * @param {Record<string, string>} store env with the store's SOLOS_CONFIG_DIR
 * @param {string} name profile name; the first saved becomes the store's default
 * @param {string} rpcUrl loopback RPC stored on the profile
 * @returns {Promise<{ keypairPath: string; address: string }>}
 */
const seedLocalProfile = async (store, name, rpcUrl) => {
  const seed = randomSeed();
  const keypairPath = path.join(store.SOLOS_CONFIG_DIR, `${name}.json`);
  writeFileSync(keypairPath, await seedToPrivateKeyString(seed));
  const address = await seedAddress(seed);
  saveProfile(store, {
    name,
    profile: {
      provider: "local",
      keypairPath,
      rpcUrl,
      wallet: { address },
      createdAt: 1,
    },
  });
  return { keypairPath, address };
};

/** @type {string} */
let fixtureDir;
/** @type {string} */
let rpcUrl;
/** @type {string} */
let wsUrl;
/** @type {{ keypairPath: string; address: string }} */
let main;
/** @type {{ keypairPath: string; address: string }} */
let alt;

/**
 * Test-owned credential store with a disposable configured default: `qa-main` is saved first and
 * becomes the store's default, `qa-alt` is selected by name. Both keypairs are random-seed files
 * inside the store itself, so nothing on the machine's real `~/.config/solos` is ever read. Both
 * profiles store the offline Surfnet RPC so the adapter round trips below reach it.
 */
beforeAll(async () => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), "solos-env-fixture-"));
  const surfnet = await ensureSurfnet();
  rpcUrl = surfnet.rpcUrl;
  wsUrl = surfnet.wsUrl;
  const store = { SOLOS_CONFIG_DIR: fixtureDir };
  main = await seedLocalProfile(store, "qa-main", rpcUrl);
  alt = await seedLocalProfile(store, "qa-alt", rpcUrl);
  await surfnet.cheats.fundSol(main.address, 1.5);
  await surfnet.cheats.fundSol(alt.address, 2.5);
});
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

describe("solana env profiles [integration]", () => {
  test("the fixture store's default profile resolves without any signer env", async () => {
    const env = loadSolanaEnv({ SOLOS_CONFIG_DIR: fixtureDir });
    expect(env.profile).toBe("qa-main");
    expect(env.signer).toEqual({ kind: "keypairPath", path: main.keypairPath });
    expect(env.rpcUrl).toBe(rpcUrl);
    expect(env.wsUrl).toBe(wsUrl);
    const balances = await Effect.runPromise(
      getBalances(undefined).pipe(Effect.provide(SolanaLive(env))),
    );
    expect(balances).toMatchObject({ owner: main.address, sol: "1.5" });
  });

  test("SOLOS_PROFILE selects the named fixture profile", async () => {
    const env = loadSolanaEnv({ SOLOS_CONFIG_DIR: fixtureDir, SOLOS_PROFILE: "qa-alt" });
    expect(env.profile).toBe("qa-alt");
    expect(env.signer).toEqual({ kind: "keypairPath", path: alt.keypairPath });
    expect(env.rpcUrl).toBe(rpcUrl);
    expect(env.wsUrl).toBe(wsUrl);
    const balances = await Effect.runPromise(
      getBalances(undefined).pipe(Effect.provide(SolanaLive(env))),
    );
    expect(balances).toMatchObject({ owner: alt.address, sol: "2.5" });
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
      SOLANA_RPC_URL: EXPLICIT_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.signer).toEqual({ kind: "privateKey", value: "x" });
    expect(env.rpcUrl).toBe(EXPLICIT_RPC);
    expect(env.profile).toBeUndefined();
  });
});
