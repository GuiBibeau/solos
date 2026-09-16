import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getBalances } from "@solos/core";
import { Effect } from "effect";
import { loadSolanaEnv } from "../env.js";
import { SolanaLive } from "../index.js";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "../surfnet/test-surfnet.js";
import { saveProfile } from "./store.js";

/** @type {string} */
let dir;
/** @type {string} */
let address;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "solos-profile-"));
  const seed = randomSeed();
  address = await seedAddress(seed);
  const keypairPath = path.join(dir, "wallet.json");
  writeFileSync(keypairPath, await seedToPrivateKeyString(seed));
  const surfnet = await ensureSurfnet();
  await surfnet.cheats.fundSol(address, 1.5);
  saveProfile(
    { SOLOS_CONFIG_DIR: dir },
    {
      name: "test",
      profile: {
        provider: "local",
        keypairPath,
        rpcUrl: surfnet.rpcUrl,
        wallet: { address },
        createdAt: Date.now(),
      },
    },
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("signer from a profile [integration]", () => {
  test("MCP-style env with only SOLOS_PROFILE resolves signer and rpc from the profile", async () => {
    const env = loadSolanaEnv({ SOLOS_CONFIG_DIR: dir, SOLOS_PROFILE: "test" });
    expect(env.profile).toBe("test");
    expect(env.signer.kind).toBe("keypairPath");
    const balances = await Effect.runPromise(
      getBalances(undefined).pipe(Effect.provide(SolanaLive(env))),
    );
    expect(balances).toMatchObject({ owner: address, sol: "1.5" });
  });

  test("explicit env still wins over the profile", () => {
    const env = loadSolanaEnv({
      SOLOS_CONFIG_DIR: dir,
      SOLOS_PROFILE: "test",
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.signer).toEqual({ kind: "privateKey", value: "x" });
    expect(env.rpcUrl).toBe("http://127.0.0.1:1");
    expect(env.profile).toBeUndefined();
  });

  test("no signer anywhere is a clear error", () => {
    expect(() =>
      loadSolanaEnv({ SOLOS_CONFIG_DIR: `${dir}-empty`, SOLANA_RPC_URL: "http://127.0.0.1:1" }),
    ).toThrow(/solos login/);
  });
});
