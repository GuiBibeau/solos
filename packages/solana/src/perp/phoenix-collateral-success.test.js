// @ts-check
import { beforeAll, expect, test } from "bun:test";
import { ActionExecutor, BuildRejected, TransactionFailed } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { ensureOfflineSurfnet, randomSeed } from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { scriptedPhoenixProgram } from "./phoenix-collateral-test-program.js";
import { startCollateralScenario } from "./phoenix-collateral-test-scenario.js";

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
});

for (const direction of /** @type {const} */ (["deposit", "withdraw", "withdraw_full"])) {
  test(`Phoenix collateral [integration] ${direction} simulates exact wire and reconciles wallet/trader after scripted Surfpool confirmation`, async () => {
    const seed = randomSeed();
    const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
      collateral: direction === "deposit" ? 0n : 2_000_000n,
    });
    const scripted = await scriptedPhoenixProgram(surfnet.rpcUrl, scenario, direction);
    const recorder = startRpcRecorder(surfnet.rpcUrl, scripted.overrides);
    try {
      const layer = SolanaTestLive({
        rpcUrl: recorder.url,
        wsUrl: surfnet.wsUrl,
        seed,
        phoenix: { baseUrl: scenario.fixture.url },
      });
      const inputAmount = direction === "withdraw_full" ? "2000000" : "1000000";
      const action = {
        type: /** @type {"deposit_perp_collateral" | "withdraw_perp_collateral"} */ (
          direction === "deposit" ? "deposit_perp_collateral" : "withdraw_perp_collateral"
        ),
        amount: inputAmount,
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
      };
      const preview = await Effect.runPromise(
        Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action)).pipe(
          Effect.provide(layer),
        ),
      );
      expect(preview.ok).toBe(true);
      expect(preview.venueQuote).toMatchObject({
        kind: "perp_collateral",
        direction: direction === "deposit" ? "deposit" : "withdraw",
        inputAmount,
        estimatedOutput: inputAmount,
        guaranteedMinimumOutput: false,
      });
      expect(scripted.sends).toBe(0);
      const result = await Effect.runPromise(
        Effect.flatMap(ActionExecutor, (executor) =>
          executor.execute(action, { skipSimulation: true }),
        ).pipe(Effect.provide(layer)),
      );
      expect(result.status).toBe("confirmed");
      expect(result.simulated).toBe(true);
      expect(result.reconciliation?.walletUsdcDelta).toBe(
        direction === "deposit" ? "-1000000" : inputAmount,
      );
      expect(result.reconciliation?.traderCollateralDelta).toBe(
        direction === "deposit" ? "1000000" : `-${inputAmount}`,
      );
      expect(scripted.sends).toBe(1);
      expect(recorder.callsFor("sendTransaction")).toHaveLength(1);
    } finally {
      scenario.fixture.stop();
      recorder.stop();
    }
  });
}

for (const direction of /** @type {const} */ (["deposit", "withdraw"])) {
  test(`Phoenix collateral [integration] ${direction} remains available with its own permission when trading is restricted`, async () => {
    const seed = randomSeed();
    const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
      collateral: direction === "withdraw" ? 2_000_000n : 0n,
      tradingRestricted: true,
    });
    const scripted = await scriptedPhoenixProgram(surfnet.rpcUrl, scenario, direction);
    const recorder = startRpcRecorder(surfnet.rpcUrl, scripted.overrides);
    try {
      const layer = SolanaTestLive({
        rpcUrl: recorder.url,
        wsUrl: surfnet.wsUrl,
        seed,
        phoenix: { baseUrl: scenario.fixture.url },
      });
      const type = /** @type {"deposit_perp_collateral" | "withdraw_perp_collateral"} */ (
        direction === "deposit" ? "deposit_perp_collateral" : "withdraw_perp_collateral"
      );
      const action = { type, amount: "1000000", traderPdaIndex: 0, traderSubaccountIndex: 0 };
      const result = await Effect.runPromise(
        Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action)).pipe(
          Effect.provide(layer),
        ),
      );
      expect(result.ok).toBe(true);
      expect(scripted.sends).toBe(0);
    } finally {
      scenario.fixture.stop();
      recorder.stop();
    }
  });
}

test("Phoenix collateral [integration] confirmed input mismatch preserves signature and never retries", async () => {
  const seed = randomSeed();
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed);
  const scripted = await scriptedPhoenixProgram(surfnet.rpcUrl, scenario, "deposit_mismatch");
  const recorder = startRpcRecorder(surfnet.rpcUrl, scripted.overrides);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const action = {
      type: /** @type {const} */ ("deposit_perp_collateral"),
      amount: "1000000",
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
    };
    const run = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(action, { skipSimulation: true }),
    );
    const exit = await Effect.runPromiseExit(run.pipe(Effect.provide(layer)));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(TransactionFailed);
      if (Option.isSome(error))
        expect(/** @type {TransactionFailed} */ (error.value).signature).toBeString();
    }
    expect(scripted.sends).toBe(1);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(1);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
});

test("Phoenix collateral [integration] partial simulated input debit rejects withdrawal before sending", async () => {
  const seed = randomSeed();
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, { collateral: 2_000_000n });
  const scripted = await scriptedPhoenixProgram(surfnet.rpcUrl, scenario, "withdraw_partial");
  const recorder = startRpcRecorder(surfnet.rpcUrl, scripted.overrides);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const action = {
      type: /** @type {const} */ ("withdraw_perp_collateral"),
      amount: "1000000",
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
    };
    const run = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(action, { skipSimulation: true }),
    );
    const exit = await Effect.runPromiseExit(run.pipe(Effect.provide(layer)));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
    }
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(1);
    expect(scripted.sends).toBe(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
});

test("Phoenix collateral [integration] cross-market exposure rejects withdrawal before signing or simulation", async () => {
  const seed = randomSeed();
  const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
    collateral: 2_000_000n,
    exposure: true,
  });
  const recorder = startRpcRecorder(surfnet.rpcUrl);
  try {
    const layer = SolanaTestLive({
      rpcUrl: recorder.url,
      wsUrl: surfnet.wsUrl,
      seed,
      phoenix: { baseUrl: scenario.fixture.url },
    });
    const action = {
      type: /** @type {const} */ ("withdraw_perp_collateral"),
      amount: "1000000",
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
    };
    const run = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(action, { skipSimulation: true }),
    );
    const exit = await Effect.runPromiseExit(run.pipe(Effect.provide(layer)));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
    }
    expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  } finally {
    scenario.fixture.stop();
    recorder.stop();
  }
});
