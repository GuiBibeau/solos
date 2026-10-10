// @ts-check
import { describe, expect, test } from "bun:test";
import { EngineConfigMissing, engageKillSwitch, listStrategies } from "@solos/core";
import { Effect } from "effect";
import { loadSolanaEnv } from "../env.js";
import { SolanaLive } from "../index.js";
import { randomSeed, seedToPrivateKeyString } from "../surfnet/test-surfnet.js";

describe("strategy tools in direct mode", () => {
  test("a list call is EngineConfigMissing and names how to reach an Engine", async () => {
    const env = loadSolanaEnv({
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_EXECUTOR: "direct",
    });
    const error = await Effect.runPromise(
      listStrategies({}).pipe(Effect.flip, Effect.provide(SolanaLive(env))),
    );
    expect(error).toBeInstanceOf(EngineConfigMissing);
    expect(error._tag).toBe("EngineConfigMissing");
    expect(error.remedy).toContain("SOLOS_EXECUTOR=engine");
    expect(error.remedy).toContain("SOLOS_ENGINE_URL");
  });

  test("engaging the kill switch is the same configuration error", async () => {
    const env = loadSolanaEnv({
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_EXECUTOR: "direct",
    });
    const error = await Effect.runPromise(
      engageKillSwitch("global", "stop").pipe(Effect.flip, Effect.provide(SolanaLive(env))),
    );
    expect(error).toBeInstanceOf(EngineConfigMissing);
    expect(error.remedy).toContain("SOLOS_ENGINE_URL");
  });
});
