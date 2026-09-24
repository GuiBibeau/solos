// @ts-check
import { afterAll, beforeAll, expect, test } from "bun:test";
import { PHOENIX_PROGRAM_ADDRESS, USDC_MINT_ADDRESS } from "@ellipsis-labs/rise";
import { ActionExecutor, BuildRejected, SimulationFailed } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import {
  ensureOfflineSurfnet,
  randomSeed,
  seedAddress,
  surfnetCheatcodes,
  jsonRpc,
} from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { seedPhoenixCollateralFixture } from "./phoenix-collateral-fixture.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import { coldState } from "./phoenix-scenarios.js";

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let recorder;
beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  recorder = startRpcRecorder(surfnet.rpcUrl);
});
afterAll(() => recorder.stop());

/** @param {"deposit_perp_collateral" | "withdraw_perp_collateral"} type */
const action = (type) => ({ type, traderPdaIndex: 0, traderSubaccountIndex: 0, amount: "1000000" });

/** @param {import("effect").Effect.Effect<unknown, unknown, never>} program */
const failure = async (program) => {
  const exit = await Effect.runPromiseExit(program);
  if (exit._tag !== "Failure") throw new Error("expected failure");
  const error = Cause.failureOption(exit.cause);
  if (Option.isNone(error)) throw new Error("expected typed failure");
  return error.value;
};

test("Phoenix collateral [integration] registered signer with no on-chain trader cannot sign or send", async () => {
  const fixture = startPhoenixFixture({
    trader: (owner) => {
      const state = coldState(owner);
      state.snapshot.capabilities.capabilities = {
        placeMarketOrder: { immediate: true },
        riskIncreasingTrade: { immediate: true },
        depositCollateral: { immediate: true },
      };
      return state;
    },
  });
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed: randomSeed(),
      phoenix: { baseUrl: fixture.url },
    });
    const sends = recorder.callsFor("sendTransaction").length;
    const program = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(action("deposit_perp_collateral"), { skipSimulation: false }),
    );
    const error = await failure(program.pipe(Effect.provide(layer)));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (error).reason).toContain("trader account");
    expect(recorder.callsFor("sendTransaction").length).toBe(sends);
  } finally {
    fixture.stop();
  }
});

test("Phoenix collateral [integration] builds real SDK deposit wire against offline accounts, but failed simulation sends nothing", async () => {
  const seed = randomSeed();
  const authority = await seedAddress(seed);
  const { global } = await seedPhoenixCollateralFixture(surfnet.rpcUrl, authority);
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.fundSol(authority, 1);
  await cheats.ensureMint(USDC_MINT_ADDRESS, 6);
  await cheats.ensureMint(global.canonicalTokenMintKey, 6);
  await cheats.setTokenAccount(authority, USDC_MINT_ADDRESS, 2_000_000);
  const slot = await jsonRpc(surfnet.rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  const fixture = startPhoenixFixture({
    trader: (owner) => {
      const state = coldState(owner);
      state.snapshot.capabilities.capabilities = {
        placeMarketOrder: { immediate: true },
        riskIncreasingTrade: { immediate: true },
        depositCollateral: { immediate: true },
        withdrawCollateral: { immediate: true },
      };
      state.slot = slot;
      return state;
    },
    exchangeSnapshot: {
      slot: String(slot),
      exchange: {
        programId: PHOENIX_PROGRAM_ADDRESS,
        globalConfig: global.accountKey,
        usdcMint: USDC_MINT_ADDRESS,
        canonicalMint: global.canonicalTokenMintKey,
        globalVault: global.globalVaultKey,
        perpAssetMap: global.perpAssetMapKey,
        withdrawQueue: global.withdrawQueueKey,
        globalTraderIndex: [global.globalTraderIndexHeaderKey],
        activeTraderBuffer: [global.activeTraderBufferHeaderKey],
        withdrawalsAvailable: true,
      },
    },
  });
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: fixture.url },
    });
    const sends = recorder.callsFor("sendTransaction").length;
    const run = Effect.flatMap(ActionExecutor, (executor) =>
      executor.simulate(action("deposit_perp_collateral")),
    );
    const result = await Effect.runPromiseExit(run.pipe(Effect.provide(layer)));
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") expect(result.value.ok).toBe(false);
    const execute = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(action("deposit_perp_collateral"), { skipSimulation: true }),
    );
    expect(await failure(execute.pipe(Effect.provide(layer)))).toBeInstanceOf(SimulationFailed);
    expect(recorder.callsFor("sendTransaction").length).toBe(sends);
  } finally {
    fixture.stop();
  }
});

test("Phoenix collateral [integration] flat funded trader builds withdrawal wire, but failed simulation sends nothing", async () => {
  const seed = randomSeed();
  const authority = await seedAddress(seed);
  const { global } = await seedPhoenixCollateralFixture(surfnet.rpcUrl, authority, 2_000_000n);
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.fundSol(authority, 1);
  await cheats.ensureMint(USDC_MINT_ADDRESS, 6);
  await cheats.ensureMint(global.canonicalTokenMintKey, 6);
  const slot = await jsonRpc(surfnet.rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  const fixture = startPhoenixFixture({
    trader: (owner) => {
      const state = coldState(owner);
      state.snapshot.capabilities.capabilities = {
        placeMarketOrder: { immediate: true },
        riskIncreasingTrade: { immediate: true },
        depositCollateral: { immediate: true },
        withdrawCollateral: { immediate: true },
      };
      state.snapshot.subaccounts[0].collateral = "2000000";
      state.slot = slot;
      return state;
    },
    exchangeSnapshot: {
      slot: String(slot),
      exchange: {
        programId: PHOENIX_PROGRAM_ADDRESS,
        globalConfig: global.accountKey,
        usdcMint: USDC_MINT_ADDRESS,
        canonicalMint: global.canonicalTokenMintKey,
        globalVault: global.globalVaultKey,
        perpAssetMap: global.perpAssetMapKey,
        withdrawQueue: global.withdrawQueueKey,
        globalTraderIndex: [global.globalTraderIndexHeaderKey],
        activeTraderBuffer: [global.activeTraderBufferHeaderKey],
        withdrawalsAvailable: true,
      },
    },
  });
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: fixture.url },
    });
    const sends = recorder.callsFor("sendTransaction").length;
    const run = Effect.flatMap(ActionExecutor, (executor) =>
      executor.simulate(action("withdraw_perp_collateral")),
    );
    const exit = await Effect.runPromiseExit(run.pipe(Effect.provide(layer)));
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") expect(exit.value.ok).toBe(false);
    const execute = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(action("withdraw_perp_collateral"), { skipSimulation: true }),
    );
    expect(await failure(execute.pipe(Effect.provide(layer)))).toBeInstanceOf(SimulationFailed);
    expect(recorder.callsFor("sendTransaction").length).toBe(sends);
  } finally {
    fixture.stop();
  }
});

test("Phoenix collateral [integration] unregistered signer cannot simulate or send either transfer", async () => {
  const fixture = startPhoenixFixture({ traderStatus: 404 });
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed: randomSeed(),
      phoenix: { baseUrl: fixture.url },
    });
    const sends = recorder.callsFor("sendTransaction").length;
    for (const type of ["deposit_perp_collateral", "withdraw_perp_collateral"]) {
      const simulation = Effect.flatMap(ActionExecutor, (executor) =>
        executor.simulate(action(type)),
      );
      const execution = Effect.flatMap(ActionExecutor, (executor) =>
        executor.execute(action(type), { skipSimulation: false }),
      );
      expect(await failure(simulation.pipe(Effect.provide(layer)))).toBeInstanceOf(BuildRejected);
      expect(await failure(execution.pipe(Effect.provide(layer)))).toBeInstanceOf(BuildRejected);
    }
    expect(recorder.callsFor("sendTransaction").length).toBe(sends);
  } finally {
    fixture.stop();
  }
});
