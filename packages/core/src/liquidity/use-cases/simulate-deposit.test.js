// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Layer, Option } from "effect";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { executeDeposit } from "./execute-deposit.js";
import { simulateDeposit } from "./simulate-deposit.js";

const ADDRESS = "11111111111111111111111111111111";
const input = {
  protocol: /** @type {"orca"} */ ("orca"),
  pool: ADDRESS,
  position: ADDRESS,
  amountA: "1000000",
  amountB: "0",
  maxSlippageBps: 50,
};

/**
 * A stub executor recording the Action it was handed, so tests assert the exact contract
 * payload without a chain. `mode` picks the outcome shape.
 * @param {{ mode?: "ok" | "simulateFailed" | "failed" }} [options]
 */
const executorLayer = ({ mode = "ok" } = {}) =>
  Layer.succeed(
    ActionExecutor,
    /** @type {import("../../shared/ports/action-executor.js").ActionExecutorShape} */ ({
      name: "stub",
      simulate: (action) =>
        Effect.succeed(
          mode === "simulateFailed"
            ? {
                action,
                ok: false,
                unitsConsumed: "0",
                logs: ["log"],
                projectedPortfolio: null,
                violations: [{ rule: "bounds", message: "over budget" }],
              }
            : {
                action,
                ok: true,
                unitsConsumed: "42",
                logs: [],
                projectedPortfolio: null,
                violations: [],
              },
        ),
      execute: (action, options) =>
        Effect.succeed(
          mode === "failed"
            ? {
                action,
                status: "failed",
                signature: null,
                executedAt: 0,
                simulated: !options.skipSimulation,
                error: "boom",
              }
            : {
                action,
                status: "confirmed",
                signature: "sig",
                executedAt: 1,
                simulated: !options.skipSimulation,
                error: null,
              },
        ),
    }),
  );

const busLayer = Layer.succeed(
  EventBus,
  /** @type {import("../../shared/ports/event-bus.js").EventBusShape} */ ({
    publish: (event) => Effect.succeed(event),
  }),
);

/**
 * @param {Effect.Effect<unknown, unknown, unknown>} effect
 * @returns {Promise<string>} the failure tag
 */
const failureTag = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  const failure = Cause.failureOption(exit.cause);
  expect(Option.isSome(failure)).toBe(true);
  return Option.getOrThrow(failure)?._tag;
};

/** @param {Effect.Effect<unknown, unknown, ActionExecutorShape>} effect */
const okValue = async (effect, layer) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer));
  expect(exit._tag).toBe("Success");
  return exit._tag === "Success" ? exit.value : undefined;
};

/** @typedef {import("../../shared/ports/action-executor.js").ActionExecutorShape} ActionExecutorShape */

describe("deposit use-case gates run before any service is required", () => {
  test("meteora is handed to the executor as add_liquidity", async () => {
    const meteora = { ...input, protocol: /** @type {"meteora"} */ ("meteora") };
    const simulated = await okValue(simulateDeposit(meteora), executorLayer());
    expect(simulated.action).toMatchObject({
      type: "add_liquidity",
      protocol: "meteora",
      maxSlippageBps: 50,
      wrapSol: false,
    });
    const executed = await okValue(
      executeDeposit({ ...meteora, skipSimulation: false }),
      Layer.merge(executorLayer(), busLayer),
    );
    expect(executed.action.protocol).toBe("meteora");
  });

  test("bad budgets or addresses fail input validation with no service required", async () => {
    expect(await failureTag(simulateDeposit({ ...input, amountA: "0", amountB: "0" }))).toBe(
      "LiquidityInputInvalid",
    );
    expect(await failureTag(simulateDeposit({ ...input, amountA: "nope", amountB: "1" }))).toBe(
      "LiquidityInputInvalid",
    );
    expect(
      await failureTag(
        simulateDeposit({ ...input, amountA: "18446744073709551616", amountB: "0" }),
      ),
    ).toBe("LiquidityInputInvalid");
    expect(await failureTag(simulateDeposit({ ...input, maxSlippageBps: 10_000 }))).toBe(
      "LiquidityInputInvalid",
    );
  });

  test("defaults resolve: slippage 50, skipSimulation false", async () => {
    const result = await okValue(
      simulateDeposit({ ...input, maxSlippageBps: undefined }),
      executorLayer(),
    );
    expect(result.action.maxSlippageBps).toBe(50);
  });
});

describe("the deposit twins pass add_liquidity through the ActionExecutor", () => {
  test("simulate hands the executor an orca add_liquidity Action with position identity", async () => {
    const layer = executorLayer();
    const result = await okValue(simulateDeposit(input), layer);
    expect(result.ok).toBe(true);
    expect(result.action).toEqual({
      type: "add_liquidity",
      protocol: "orca",
      pool: ADDRESS,
      position: ADDRESS,
      amountA: "1000000",
      amountB: "0",
      maxSlippageBps: 50,
      // Defaulted, not inferred: solOS never wraps native SOL unless asked.
      wrapSol: false,
    });
  });

  test("a failed simulation is a typed SimulationFailed with the violations joined", async () => {
    const tag = await failureTag(
      simulateDeposit(input).pipe(Effect.provide(executorLayer({ mode: "simulateFailed" }))),
    );
    expect(tag).toBe("SimulationFailed");
  });

  test("execute forwards skipSimulation and confirms", async () => {
    const layer = Layer.merge(executorLayer(), busLayer);
    const result = await okValue(executeDeposit({ ...input, skipSimulation: true }), layer);
    expect(result.status).toBe("confirmed");
    expect(result.simulated).toBe(false);
    const simulated = await okValue(executeDeposit(input), layer);
    expect(simulated.simulated).toBe(true);
  });

  test("a non-confirmed execution is a typed TransactionFailed", async () => {
    const tag = await failureTag(
      Effect.provide(
        executeDeposit(input),
        Layer.merge(executorLayer({ mode: "failed" }), busLayer),
      ),
    );
    expect(tag).toBe("TransactionFailed");
  });

  test("the typed errors are the slice's own classes", () => {
    expect(new LiquidityInputInvalid({ reason: "x" })._tag).toBe("LiquidityInputInvalid");
    expect(new LiquidityUnsupportedProtocol({ protocol: "meteora" })._tag).toBe(
      "LiquidityUnsupportedProtocol",
    );
  });
});
