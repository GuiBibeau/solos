// @ts-check
import { expect, test } from "bun:test";
import {
  getPlaceMarketOrderDecoder,
  OrderFlags,
  PHOENIX_PROGRAM_ADDRESS,
  Side,
} from "@ellipsis-labs/rise";
import {
  decompileTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { ActionExecutor, BuildRejected, SimulationFailed } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaRpc, SolanaRpcLive, SolanaTestLive } from "../index.js";
import { ensureOfflineSurfnet, randomSeed } from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { startCollateralScenario } from "./phoenix-collateral-test-scenario.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import { readOpenRisk } from "./phoenix-open-risk.js";
import { seedOpenMarket } from "./phoenix-open-test-market.js";

const action = {
  type: /** @type {const} */ ("open_perp"),
  traderPdaIndex: /** @type {const} */ (0),
  traderSubaccountIndex: /** @type {const} */ (0),
  market: "SOL",
  side: /** @type {const} */ ("long"),
  notionalUsd: "30000000",
  maxLeverage: 2,
  limitPriceUsd: "150.25",
};

test("Phoenix IOC open risk [integration] accepts funded, fully flat trader with fresh all-market state", async () => {
  const surfnet = await ensureOfflineSurfnet();
  // The live API sends a zero-balance SOL spot row for every trader; it must not read as risk.
  const scenario = await startCollateralScenario(surfnet.rpcUrl, randomSeed(), {
    collateral: 30_000_000n,
    spotCollaterals: [{ assetIndex: 4_294_901_760, symbol: "SOL", balance: "0", decimals: 9 }],
  });
  try {
    const result = await Effect.runPromise(
      Effect.flatMap(SolanaRpc, (ctx) =>
        Effect.flatMap(readCollateralTrader(ctx, scenario.owner), ({ state }) =>
          readOpenRisk({
            config: { baseUrl: scenario.fixture.url },
            ctx,
            owner: scenario.owner,
            trader: state,
          }),
        ),
      ).pipe(Effect.provide(SolanaRpcLive(surfnet.rpcUrl, surfnet.wsUrl))),
    );
    expect(result.collateral).toBe(30_000_000n);
    expect(result.slot).toBeGreaterThan(0n);
  } finally {
    scenario.fixture.stop();
  }
}, 15_000);

test("Phoenix IOC open risk [integration] refuses unpriced on-chain native SOL collateral", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const scenario = await startCollateralScenario(surfnet.rpcUrl, randomSeed(), {
    collateral: 30_000_000n,
  });
  try {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(SolanaRpc, (ctx) =>
        Effect.flatMap(readCollateralTrader(ctx, scenario.owner), ({ state }) =>
          readOpenRisk({
            config: { baseUrl: scenario.fixture.url },
            ctx,
            owner: scenario.owner,
            trader: { ...state, nativeSolCollateral: 1n },
          }),
        ),
      ).pipe(Effect.provide(SolanaRpcLive(surfnet.rpcUrl, surfnet.wsUrl))),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
    }
    expect(scenario.fixture.requests).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
  }
}, 15_000);

test("Phoenix IOC open [integration] simulates a signed bounded order against offline Surfpool and never submits", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const { market } = await seedOpenMarket(surfnet.rpcUrl);
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 30_000_000n,
    market,
  });
  const recorder = startRpcRecorder(surfnet.rpcUrl);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const alias = { ...action, market: "SOL-PERP" }; // Existing published Action form.
    const result = await Effect.runPromise(
      Effect.flatMap(ActionExecutor, (executor) => executor.simulate(alias)).pipe(
        Effect.provide(layer),
      ),
    );
    expect(result.action).toEqual(alias);
    expect(result.ok).toBe(false); // Offline Surfpool has no cloned Phoenix program; this is not a fill.
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(1);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
    const wire = getBase64Codec().encode(
      /** @type {string} */ (recorder.callsFor("simulateTransaction")[0]?.params[0]),
    );
    const decoded = getTransactionDecoder().decode(wire);
    const compiled = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    expect(compiled.version).toBe(1);
    expect(compiled.header.numSignerAccounts).toBe(1);
    const latest = /** @type {{value:{lastValidBlockHeight:bigint}}} */ (
      recorder.callsFor("getLatestBlockhash")[0]?.result
    );
    const message = decompileTransactionMessage(
      /** @type {Parameters<typeof decompileTransactionMessage>[0]} */ (
        /** @type {unknown} */ (compiled)
      ),
      { lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight) },
    );
    expect(message.instructions.map((ix) => ix.programAddress)).toEqual([PHOENIX_PROGRAM_ADDRESS]);
    const packet = getPlaceMarketOrderDecoder().decode(
      message.instructions[0]?.data ?? new Uint8Array(),
    );
    expect(packet.side).toBe(Side.Bid);
    expect(packet.priceInTicks).toBe(15_025n);
    expect(packet.numBaseLots).toBe(19n);
    expect(packet.numQuoteLots).toBe(30_000_000n);
    expect(packet.orderFlags).toBe(OrderFlags.None);
    expect(packet.lastValidSlot).toBeGreaterThan(0n);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);

test("Phoenix IOC open [integration] does not submit if exact signed execution simulation fails", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const { market } = await seedOpenMarket(surfnet.rpcUrl);
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 30_000_000n,
    market,
  });
  const recorder = startRpcRecorder(surfnet.rpcUrl);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(ActionExecutor, (executor) =>
        executor.execute(action, { skipSimulation: false }),
      ).pipe(Effect.provide(layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(SimulationFailed);
    }
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(1);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);

for (const variant of [
  { name: "zero collateral", options: { collateral: 0n } },
  { name: "stale all-market state", options: { collateral: 30_000_000n, staleRisk: true } },
  { name: "spot collateral exposure", options: { collateral: 30_000_000n, spotExposure: true } },
  { name: "existing market position", options: { collateral: 30_000_000n, exposure: true } },
  { name: "insufficient leverage equity", options: { collateral: 1_000_000n } },
  { name: "no trade permission", options: { collateral: 30_000_000n, tradingRestricted: true } },
]) {
  test(`Phoenix IOC open [integration] refuses ${variant.name} before RPC simulation or send`, async () => {
    const surfnet = await ensureOfflineSurfnet();
    const seed = randomSeed();
    const { market } = await seedOpenMarket(surfnet.rpcUrl);
    const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
      ...variant.options,
      market,
    });
    const recorder = startRpcRecorder(surfnet.rpcUrl);
    try {
      const layer = SolanaTestLive({
        rpcUrl: recorder.url,
        wsUrl: surfnet.wsUrl,
        seed,
        phoenix: { baseUrl: scenario.fixture.url },
      });
      const exit = await Effect.runPromiseExit(
        Effect.flatMap(ActionExecutor, (executor) =>
          executor.execute(action, { skipSimulation: variant.name === "zero collateral" }),
        ).pipe(Effect.provide(layer)),
      );
      expect(exit._tag).toBe("Failure");
      expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
      expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
    } finally {
      scenario.fixture.stop();
      recorder.stop();
    }
  }, 20_000);
}

test("Phoenix IOC open [integration] rejects unknown market before simulation or submission", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, { collateral: 30_000_000n });
  const recorder = startRpcRecorder(surfnet.rpcUrl);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(ActionExecutor, (executor) =>
        executor.execute({ ...action, market: "DOGE" }, { skipSimulation: false }),
      ).pipe(Effect.provide(layer)),
    );
    expect(exit._tag).toBe("Failure");
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);

test("Phoenix IOC open [integration] rejects absent enrollment without simulating or submitting", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const fixture = startPhoenixFixture({ traderStatus: 404 });
  const recorder = startRpcRecorder(surfnet.rpcUrl);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed: randomSeed(),
      phoenix: { baseUrl: fixture.url },
    });
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action)).pipe(
        Effect.provide(layer),
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
    }
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    fixture.stop();
    recorder.stop();
  }
}, 15_000);
