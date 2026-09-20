// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { EventBusInMemory } from "../../shared/layers/event-bus-in-memory.js";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { executeSwap } from "./execute-swap.js";
import { simulateSwap } from "./simulate-swap.js";

const request = {
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "10000000",
  slippageBps: 50,
};

const executor = Layer.succeed(ActionExecutor, {
  name: "contract-fixture",
  simulate: (action) =>
    Effect.succeed({
      action,
      ok: true,
      unitsConsumed: "123",
      logs: ["simulated"],
      projectedPortfolio: null,
      violations: [],
    }),
  execute: (action, options) =>
    Effect.succeed({
      action,
      status: "confirmed",
      signature: "1".repeat(64),
      executedAt: 1_700_000_000_000,
      simulated: !options.skipSimulation,
      error: null,
    }),
});

const layer = Layer.merge(executor, EventBusInMemory);

describe("swap twins preserve the shared executor result contracts", () => {
  test("simulate returns SimulationResult including nullable projectedPortfolio", async () => {
    const result = await Effect.runPromise(simulateSwap(request).pipe(Effect.provide(layer)));
    expect(result).toEqual({
      action: {
        type: "swap",
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        amount: request.amount,
        maxSlippageBps: 50,
      },
      ok: true,
      unitsConsumed: "123",
      logs: ["simulated"],
      projectedPortfolio: null,
      violations: [],
    });
  });

  test("execute returns the executor's shared ExecutionResult", async () => {
    const result = await Effect.runPromise(executeSwap(request).pipe(Effect.provide(layer)));
    expect(result.status).toBe("confirmed");
    expect(result.action).toEqual({
      type: "swap",
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      maxSlippageBps: 50,
    });
    expect(result).toMatchObject({ simulated: true, error: null });
  });
});
