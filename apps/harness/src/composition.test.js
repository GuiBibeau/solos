// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store, searchTools } from "@solos/core";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { Effect, Option } from "effect";
import { loadHarness, makeHarnessRuntime } from "./composition.js";

/** @type {string} */
let dir;
/** @type {ReturnType<typeof makeHarnessRuntime> | undefined} */
let runtime;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "solos-harness-composition-"));
  const configPath = path.join(dir, "harness.config.js");
  await writeFile(configPath, "export default {};\n");
  const { layer } = await loadHarness({
    configPath,
    env: {
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_CONFIG_DIR: dir,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
    },
  });
  runtime = makeHarnessRuntime(layer);
});

afterAll(async () => {
  await runtime?.dispose();
  await rm(dir, { recursive: true, force: true });
});

describe("harness composition [integration]", () => {
  test("a lower tool ceiling reaches the catalogue, so the search tool reports it", async () => {
    const configPath = path.join(dir, "harness.config.js");
    const { layer } = await loadHarness({
      configPath,
      toolCeiling: "read",
      env: {
        SOLANA_RPC_URL: "http://127.0.0.1:1",
        SOLOS_CONFIG_DIR: dir,
        SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
        SOLOS_LOG_LEVEL: "warn",
      },
    });
    const capped = makeHarnessRuntime(layer);
    try {
      const result = await capped.runPromise(searchTools({ group: "wallet", limit: 8 }));
      expect(result.ceiling).toBe("read");
      expect(result.matches.map((match) => [match.name, match.available])).toEqual([
        ["solana_wallet_execute_close_token_account", false],
        ["solana_wallet_get_address", true],
        ["solana_wallet_get_balance", true],
        ["solana_wallet_simulate_close_token_account", false],
      ]);
    } finally {
      await capped.dispose();
    }
  });

  test("provides the tool catalogue under no ceiling, so the search tool works in the agent loop", async () => {
    const result = await /** @type {NonNullable<typeof runtime>} */ (runtime).runPromise(
      searchTools({ group: "wallet", limit: 8 }),
    );
    expect(result.ceiling).toBe("execute");
    expect(result.matches.map((match) => [match.name, match.available])).toEqual([
      ["solana_wallet_execute_close_token_account", true],
      ["solana_wallet_get_address", true],
      ["solana_wallet_get_balance", true],
      ["solana_wallet_simulate_close_token_account", true],
    ]);
    expect(result.notes).toEqual([]);
  });

  test("provides the Store port in memory: a value written is read back and nothing hits disk", async () => {
    const live = /** @type {NonNullable<typeof runtime>} */ (runtime);
    const read = await live.runPromise(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.set("composition.test", "k", { n: 1 });
        return yield* store.get("composition.test", "k");
      }),
    );
    expect(Option.getOrNull(read)).toEqual({ n: 1 });
    // Only the config file: the retired SQLite store (#193) is not recreated.
    expect(await readdir(dir)).toEqual(["harness.config.js"]);
  });
});
