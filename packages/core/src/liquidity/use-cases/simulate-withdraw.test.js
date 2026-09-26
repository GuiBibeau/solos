// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { executeWithdraw } from "./execute-withdraw.js";
import { simulateWithdraw } from "./simulate-withdraw.js";

const ADDRESS = "11111111111111111111111111111111";

const executorLayer = Layer.succeed(
  ActionExecutor,
  /** @type {import("../../shared/ports/action-executor.js").ActionExecutorShape} */ ({
    name: "stub",
    simulate: (action) =>
      Effect.succeed({
        action,
        ok: true,
        unitsConsumed: "42",
        logs: [],
        projectedPortfolio: null,
        violations: [],
      }),
    execute: (action) =>
      Effect.succeed({
        action,
        status: "confirmed",
        signature: "sig",
        executedAt: 1,
        simulated: true,
        error: null,
      }),
  }),
);

const busLayer = Layer.succeed(
  EventBus,
  /** @type {import("../../shared/ports/event-bus.js").EventBusShape} */ ({
    publish: (event) => Effect.succeed(event),
  }),
);

/** @param {import("effect").Effect.Effect<any, unknown, any>} effect @param {Layer.Layer<any, unknown, never>} layer */
const okValue = async (effect, layer) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer));
  expect(exit._tag).toBe("Success");
  return exit._tag === "Success" ? exit.value : undefined;
};

describe("withdraw use-case gates", () => {
  test("meteora is handed to the executor as remove_liquidity", async () => {
    const meteora = {
      protocol: /** @type {"meteora"} */ ("meteora"),
      position: ADDRESS,
      bps: 10_000,
      maxSlippageBps: 50,
    };
    const simulated = await okValue(simulateWithdraw(meteora), executorLayer);
    expect(simulated.action).toMatchObject({
      type: "remove_liquidity",
      protocol: "meteora",
      position: ADDRESS,
      bps: 10_000,
      maxSlippageBps: 50,
    });
    const executed = await okValue(executeWithdraw(meteora), Layer.merge(executorLayer, busLayer));
    expect(executed.action.protocol).toBe("meteora");
  });
});
