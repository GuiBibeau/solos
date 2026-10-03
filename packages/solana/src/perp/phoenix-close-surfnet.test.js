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
import {
  ActionExecutor,
  BuildRejected,
  NoPositionToClose,
  PerpVenue,
  SimulationFailed,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { ensureOfflineSurfnet, randomSeed } from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { seedClosePosition } from "./phoenix-close-test-position.js";
import { startCollateralScenario } from "./phoenix-collateral-test-scenario.js";
import { seedOpenMarket } from "./phoenix-open-test-market.js";

const action = {
  type: /** @type {const} */ ("close_perp"),
  traderPdaIndex: /** @type {const} */ (0),
  traderSubaccountIndex: /** @type {const} */ (0),
  market: "SOL",
  limitPriceUsd: "110.25",
};

test("Phoenix reduce-only close [integration] simulates exactly one signed SDK IOC without submitting", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const { market } = await seedOpenMarket(surfnet.rpcUrl);
  // The live API sends a zero-balance SOL spot row for every trader; it must not block a close.
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 30_000_000n,
    market,
    positionLots: 100n,
    spotCollaterals: [{ assetIndex: 4_294_901_760, symbol: "SOL", balance: "0", decimals: 9 }],
  });
  await seedClosePosition(surfnet.rpcUrl, scenario.trader, 100n);
  const recorder = startRpcRecorder(surfnet.rpcUrl);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const result = await Effect.runPromise(
      Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action)).pipe(
        Effect.provide(layer),
      ),
    );
    expect(result.action).toEqual(action);
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(1);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
    const wire = getBase64Codec().encode(
      /** @type {string} */ (recorder.callsFor("simulateTransaction")[0]?.params[0]),
    );
    const decoded = getTransactionDecoder().decode(wire);
    const compiled = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    const latest = /** @type {{value:{lastValidBlockHeight:bigint}}} */ (
      recorder.callsFor("getLatestBlockhash")[0]?.result
    );
    const message = decompileTransactionMessage(
      /** @type {Parameters<typeof decompileTransactionMessage>[0]} */ (
        /** @type {unknown} */ (compiled)
      ),
      { lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight) },
    );
    expect(compiled.version).toBe(1);
    expect(compiled.header.numSignerAccounts).toBe(1);
    expect(message.instructions.map((ix) => ix.programAddress)).toEqual([PHOENIX_PROGRAM_ADDRESS]);
    const packet = getPlaceMarketOrderDecoder().decode(
      message.instructions[0]?.data ?? new Uint8Array(),
    );
    expect(packet.side).toBe(Side.Ask);
    expect(packet.numBaseLots).toBe(100n);
    expect(packet.priceInTicks).toBe(11_025n);
    expect(packet.orderFlags).toBe(OrderFlags.ReduceOnly);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);

test("Phoenix reduce-only close [integration] refuses a failed signed simulation without sending", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const { market } = await seedOpenMarket(surfnet.rpcUrl);
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 30_000_000n,
    market,
    positionLots: -100n,
  });
  await seedClosePosition(surfnet.rpcUrl, scenario.trader, -100n);
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

test("Phoenix reduce-only close [integration] rejects a changed position after simulation without sending", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const { market } = await seedOpenMarket(surfnet.rpcUrl);
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 30_000_000n,
    market,
    positionLots: 100n,
  });
  await seedClosePosition(surfnet.rpcUrl, scenario.trader, 100n);
  const recorder = startRpcRecorder(surfnet.rpcUrl, {
    simulateTransaction: async () => {
      await seedClosePosition(surfnet.rpcUrl, scenario.trader, 50n);
      return { value: { err: null, logs: [], unitsConsumed: 52_000 } };
    },
  });
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
      expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
    }
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(1);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);

test("Phoenix reduce-only close [integration] confirms submission but reports residual exposure on a separate read, without retry", async () => {
  const surfnet = await ensureOfflineSurfnet();
  for (const residual of [100n, 40n, 0n]) {
    const seed = randomSeed();
    const { market } = await seedOpenMarket(surfnet.rpcUrl);
    const options = { collateral: 30_000_000n, market, positionLots: 100n };
    const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, options);
    await seedClosePosition(surfnet.rpcUrl, scenario.trader, 100n);
    const recorder = startRpcRecorder(surfnet.rpcUrl, {
      simulateTransaction: () => ({ value: { err: null, logs: [], unitsConsumed: 52_000 } }),
      sendTransaction: async () => {
        // Scripted protocol outcome: confirmation alone does not establish an economic fill.
        options.positionLots = residual;
        await seedClosePosition(surfnet.rpcUrl, scenario.trader, residual);
        return "1111111111111111111111111111111111111111111111111111111111111111";
      },
      getSignatureStatuses: () => ({
        context: { slot: 100 },
        value: [{ confirmationStatus: "confirmed", err: null }],
      }),
    });
    try {
      const layer = SolanaTestLive({
        rpcUrl: recorder.url,
        wsUrl: surfnet.wsUrl,
        seed,
        phoenix: { baseUrl: scenario.fixture.url },
      });
      const result = await Effect.runPromise(
        Effect.flatMap(ActionExecutor, (executor) =>
          executor.execute(action, { skipSimulation: false }),
        ).pipe(Effect.provide(layer)),
      );
      expect(result.status).toBe("confirmed");
      expect(result.simulated).toBe(true);
      expect(recorder.callsFor("simulateTransaction")).toHaveLength(1);
      expect(recorder.callsFor("sendTransaction")).toHaveLength(1);
      const followUp = await Effect.runPromise(
        Effect.flatMap(PerpVenue, (venue) =>
          venue.getPosition({ market: "SOL", owner: scenario.owner }),
        ).pipe(Effect.provide(layer)),
      );
      expect(followUp.position.side).toBe(residual === 0n ? "flat" : "long");
      expect(followUp.position.amount).toBe(residual.toString());
      expect(recorder.callsFor("sendTransaction")).toHaveLength(1);
    } finally {
      scenario.fixture.stop();
      recorder.stop();
    }
  }
}, 30_000);

test("Phoenix reduce-only close [integration] returns NoPositionToClose before simulation or send", async () => {
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
      expect(Option.isSome(error) && error.value).toBeInstanceOf(NoPositionToClose);
    }
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);
