// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Layer, Option } from "effect";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";
import {
  executeOpenPosition,
  simulateClosePosition,
  simulateOpenPosition,
} from "./position-lifecycle.js";

const ADDRESS = "11111111111111111111111111111111";

/** @type {import("@solos/actions").Action | undefined} */
let seen;

const executorLayer = Layer.succeed(
  ActionExecutor,
  /** @type {import("../../shared/ports/action-executor.js").ActionExecutorShape} */ ({
    name: "stub",
    simulate: (action) => {
      seen = action;
      return Effect.succeed({
        action,
        ok: true,
        unitsConsumed: "1",
        logs: [],
        projectedPortfolio: null,
        violations: [],
      });
    },
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

/** @param {import("effect").Effect.Effect<unknown, unknown, unknown>} effect */
const failureOf = async (effect) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, executorLayer));
  expect(exit._tag).toBe("Failure");
  if (exit._tag !== "Failure") return undefined;
  const failure = Cause.failureOption(exit.cause);
  expect(Option.isSome(failure)).toBe(true);
  return Option.getOrThrow(failure);
};

const raydium = {
  protocol: /** @type {const} */ ("raydium"),
  pool: ADDRESS,
  tickLower: -100,
  tickUpper: 100,
  amountA: "1",
  amountB: "0",
  maxSlippageBps: 50,
};

describe("position lifecycle validation", () => {
  test("an illegal meteora width is refused by name and never reaches the executor", async () => {
    seen = undefined;
    const wide = await failureOf(
      simulateOpenPosition({ protocol: "meteora", pool: ADDRESS, lowerBinId: 0, width: 71 }),
    );
    expect(wide).toBeInstanceOf(LiquidityInputInvalid);
    expect(/** @type {LiquidityInputInvalid} */ (wide).reason).toContain("71");
    expect(/** @type {LiquidityInputInvalid} */ (wide).reason).toContain("not clamped");

    const zero = await failureOf(
      simulateOpenPosition({ protocol: "meteora", pool: ADDRESS, lowerBinId: 0, width: 0 }),
    );
    expect(/** @type {LiquidityInputInvalid} */ (zero).reason).toContain("width 0");

    const negative = await failureOf(
      simulateOpenPosition({ protocol: "meteora", pool: ADDRESS, lowerBinId: 0, width: -3 }),
    );
    expect(/** @type {LiquidityInputInvalid} */ (negative).reason).toContain("-3");
    expect(/** @type {LiquidityInputInvalid} */ (negative).reason).toContain("not clamped");
    expect(seen).toBeUndefined();
  });

  test("ticks on meteora and bins on raydium are refused before a build", async () => {
    const ticked = await failureOf(simulateOpenPosition({ ...raydium, protocol: "meteora" }));
    expect(ticked).toBeInstanceOf(LiquidityInputInvalid);
    expect(/** @type {LiquidityInputInvalid} */ (ticked).reason).toContain("lowerBinId");

    const binned = await failureOf(
      simulateOpenPosition({ ...raydium, lowerBinId: 0, width: 4 }),
    );
    expect(binned).toBeInstanceOf(LiquidityInputInvalid);
    expect(/** @type {LiquidityInputInvalid} */ (binned).reason).toContain("tick range");
  });

  test("orca still fails the protocol gate", async () => {
    const failure = await failureOf(simulateOpenPosition({ ...raydium, protocol: "orca" }));
    expect(failure).toBeInstanceOf(LiquidityUnsupportedProtocol);
    const closed = await failureOf(
      simulateClosePosition({ protocol: "orca", position: ADDRESS }),
    );
    expect(closed).toBeInstanceOf(LiquidityUnsupportedProtocol);
  });

  test("a legal meteora open and a legal raydium open both reach the executor", async () => {
    const meteora = await Effect.runPromise(
      simulateOpenPosition({
        protocol: "meteora",
        pool: ADDRESS,
        lowerBinId: -10,
        width: 5,
      }).pipe(Effect.provide(executorLayer)),
    );
    expect(meteora.action).toMatchObject({ protocol: "meteora", lowerBinId: -10, width: 5 });
    expect("tickLower" in meteora.action).toBe(false);

    const opened = await Effect.runPromise(
      simulateOpenPosition(raydium).pipe(Effect.provide(executorLayer)),
    );
    expect(opened.action).toMatchObject({ protocol: "raydium", tickLower: -100, tickUpper: 100 });
    expect("lowerBinId" in opened.action).toBe(false);

    const executed = await Effect.runPromise(
      executeOpenPosition({
        protocol: "meteora",
        pool: ADDRESS,
        lowerBinId: -10,
        width: 5,
        skipSimulation: false,
      }).pipe(Effect.provide(Layer.merge(executorLayer, busLayer))),
    );
    expect(executed.action).toMatchObject({ protocol: "meteora", width: 5 });
    expect("skipSimulation" in executed.action).toBe(false);
  });
});
