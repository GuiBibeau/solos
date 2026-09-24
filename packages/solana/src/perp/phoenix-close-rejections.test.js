// @ts-check
import { expect, test } from "bun:test";
import { ActionExecutor } from "@solos/core";
import { Effect } from "effect";
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

test("Phoenix close rejections [integration] reject other-market funding-only exposure before simulation", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const seed = randomSeed();
  const { market } = await seedOpenMarket(surfnet.rpcUrl);
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 30_000_000n,
    market,
    positionLots: 100n,
    otherFunding: true,
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
    const result = await Effect.runPromiseExit(
      Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action)).pipe(
        Effect.provide(layer),
      ),
    );
    expect(result._tag).toBe("Failure");
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
}, 20_000);

test("Phoenix close rejections [integration] fail before simulation and send for unknown market, disagreeing accounts and invalid limit", async () => {
  const surfnet = await ensureOfflineSurfnet();
  for (const variant of ["unknown", "mismatch", "invalid"]) {
    const seed = randomSeed();
    const { market } = await seedOpenMarket(surfnet.rpcUrl);
    const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
      collateral: 30_000_000n,
      market,
      positionLots: 100n,
    });
    await seedClosePosition(surfnet.rpcUrl, scenario.trader, variant === "mismatch" ? -100n : 100n);
    const recorder = startRpcRecorder(surfnet.rpcUrl);
    try {
      const layer = SolanaTestLive({
        rpcUrl: recorder.url,
        wsUrl: surfnet.wsUrl,
        seed,
        phoenix: { baseUrl: scenario.fixture.url },
      });
      const input = {
        ...action,
        market: variant === "unknown" ? "UNKNOWN" : "SOL",
        limitPriceUsd: variant === "invalid" ? "0" : "110.25",
      };
      const result = await Effect.runPromiseExit(
        Effect.flatMap(ActionExecutor, (executor) =>
          executor.execute(input, { skipSimulation: false }),
        ).pipe(Effect.provide(layer)),
      );
      expect(result._tag).toBe("Failure");
      expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
      expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
    } finally {
      scenario.fixture.stop();
      recorder.stop();
    }
  }
}, 20_000);
