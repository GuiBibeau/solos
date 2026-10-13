// @ts-check
import { describe, expect, test } from "bun:test";
import { StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { CapLedger } from "../ports/cap-ledger.js";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickSubmit } from "../ports/tick-submit.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { runTick } from "./run-tick.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NOW = 1_700_000_000_000;
const ACTION = { type: "transfer_sol", to: USDC, lamports: "1" };

/**
 * @param {Record<string, unknown>} [patch]
 */
const strategyOf = (patch = {}) =>
  StrategySchema.parse({
    schemaVersion: 1,
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    state: "active",
    owner: "swarm",
    kind: "schedule",
    params: { actions: [ACTION, ACTION] },
    tickSource: { type: "clock", every: 60_000 },
    createdAt: NOW,
    expiresAt: null,
    nextDueAt: NOW,
    bounds: {
      maxNotionalPerTickUsd: "10",
      maxDailySpendUsd: "1000",
      allowedMints: [],
      expiresAt: null,
      maxConsecutiveFailures: 3,
    },
    ...patch,
  });

/** @param {import("@solos-sh/actions").Strategy} strategy @param {Record<string, unknown>} [options] */
const provided = (strategy, options = {}) => {
  const repository = memoryStrategyRepository();
  const quote = /** @type {import("../ports/spend-meter.js").SpendQuote} */ (
    options.quote ?? { reserveUsd: "6", actualUsd: "6", mint: USDC }
  );
  const lamports = /** @type {string} */ (options.lamports ?? "10000000000");
  const isDry = options.dry === true;
  const layer = Layer.mergeAll(
    ids(),
    clockTickSource,
    repository,
    memoryTickRepository(),
    memoryCapLedger({ boundsFor: () => strategy.bounds }),
    scriptedObservationReader(() => ({ lamports })),
    scriptedSpendMeter(quote),
    submit(options.failSecond === true, /** @type {(() => void) | undefined} */ (options.onSubmit)),
    Layer.succeed(RunMode, { dry: isDry }),
  );
  return { repository, layer };
};

const ids = () => {
  let n = 0;
  return Layer.sync(StrategyIds, () => ({
    now: () => Effect.succeed(NOW),
    ulid: () =>
      Effect.sync(() => {
        n += 1;
        return `01ARZ3NDEKTSV4RRFFQ69G5FA${n}`;
      }),
  }));
};

/** @param {boolean} failSecond @param {() => void} [onSubmit] */
const submit = (failSecond, onSubmit) =>
  Layer.sync(TickSubmit, () => ({
    submit: (input) => {
      if (onSubmit !== undefined) onSubmit();
      return Effect.succeed(
        failSecond && input.intentId.endsWith(".1")
          ? {
              intentId: input.intentId,
              state: "failed",
              reason: "swap route failed",
              remedy: "retry",
            }
          : { intentId: input.intentId, state: "settled", signature: "sig" },
      );
    },
  }));

/** @param {import("@solos-sh/actions").Strategy} strategy @param {Record<string, unknown>} [options] */
const tick = (strategy, options) => {
  const world = provided(strategy, options);
  return Effect.gen(function* () {
    yield* (yield* StrategyRepository).save(strategy);
    return yield* runTick(strategy);
  }).pipe(Effect.provide(world.layer));
};

describe("runTick bounds", () => {
  test("two Actions that each fit a tick cap record skipped_bounds when they exceed it together", async () => {
    const strategy = strategyOf();
    const recorded = await Effect.runPromise(tick(strategy));
    expect(recorded.outcome).toBe("skipped_bounds");
    expect(recorded.step).toBe(1);
    expect(recorded.intents).toHaveLength(1);
    expect(recorded.intents[0]?.state).toBe("settled");
    expect(recorded.reason).toContain("per-tick cap");
  });

  test("a dry tick records the Actions and does not reserve", async () => {
    const strategy = strategyOf({
      bounds: { ...strategyOf().bounds, maxNotionalPerTickUsd: "0" },
    });
    const recorded = await Effect.runPromise(tick(strategy, { dry: true }));
    expect(recorded.outcome).toBe("evaluated");
    expect(recorded.intents).toHaveLength(0);
    expect(recorded.actions).toHaveLength(2);
  });

  test("a settle above the hold is recorded and the ledger engages the switch", async () => {
    const strategy = strategyOf({ params: { actions: [ACTION] } });
    const world = provided(strategy, { quote: { reserveUsd: "6", actualUsd: "8", mint: USDC } });
    const recorded = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* StrategyRepository).save(strategy);
        const first = yield* runTick(strategy);
        const status = yield* (yield* CapLedger).status(strategy.id);
        const second = yield* runTick(strategy);
        return { first, status, second };
      }).pipe(Effect.provide(world.layer)),
    );
    expect(recorded.first.outcome).toBe("executed");
    expect(recorded.first.reason).toContain("above the reserved hold");
    expect(recorded.status.reason).toContain("settle exceeded reservation");
    expect(recorded.second.outcome).toBe("skipped_kill_switch");
  });

  test("an engaged kill switch records skipped_kill_switch and reserves nothing", async () => {
    const strategy = strategyOf({ params: { actions: [ACTION], count: 1 } });
    let submits = 0;
    const world = provided(strategy, {
      onSubmit: () => {
        submits += 1;
      },
    });
    const recorded = await Effect.runPromise(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        yield* (yield* StrategyRepository).save(strategy);
        yield* ledger.engage({ scope: strategy.id, reason: "operator stop" });
        const skipped = yield* runTick(strategy);
        yield* ledger.disengage(strategy.id);
        const probe = yield* ledger.reserve({
          strategyId: strategy.id,
          tickId: skipped.tickId,
          intentId: "probe",
          notionalUsd: "1",
          mint: USDC,
        });
        const stored = yield* (yield* StrategyRepository).load(strategy.id);
        return {
          skipped,
          reserved: probe.reservationId,
          state: stored?.state,
          nextDueAt: stored?.nextDueAt,
        };
      }).pipe(Effect.provide(world.layer)),
    );
    expect(submits).toBe(0);
    expect(recorded.skipped.outcome).toBe("skipped_kill_switch");
    expect(recorded.skipped.intents).toHaveLength(0);
    expect(recorded.reserved).toBe("res_1");
    expect(recorded.state).toBe("active");
    expect(recorded.nextDueAt).toBe(NOW + 60_000);
  });

  test("a signer that cannot fund the Actions fails with no Intent", async () => {
    const strategy = strategyOf({
      params: { actions: [ACTION] },
      bounds: { ...strategyOf().bounds, maxConsecutiveFailures: 1 },
    });
    const world = provided(strategy, { lamports: "0" });
    const recorded = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* StrategyRepository).save(strategy);
        const failed = yield* runTick(strategy);
        const stored = yield* (yield* StrategyRepository).load(strategy.id);
        return { failed, state: stored?.state, reason: stored?.reason };
      }).pipe(Effect.provide(world.layer)),
    );
    expect(recorded.failed.outcome).toBe("failed");
    expect(recorded.failed.intents).toHaveLength(0);
    expect(recorded.failed.observations.lamports).toBe("0");
    expect(recorded.failed.observations.instant).toBe(NOW);
    expect(recorded.state).toBe("paused");
  });

  test("the second Action's failure keeps the first Intent settled", async () => {
    const strategy = strategyOf();
    const recorded = await Effect.runPromise(
      tick(strategy, { failSecond: true, quote: { reserveUsd: "1", actualUsd: "1", mint: USDC } }),
    );
    expect(recorded.outcome).toBe("failed");
    expect(recorded.step).toBe(1);
    expect(recorded.intents[0]?.state).toBe("settled");
    expect(recorded.intents[1]?.state).toBe("failed");
  });

  test("a finite count moves the Strategy to done", async () => {
    const strategy = strategyOf({ params: { actions: [ACTION], count: 1 } });
    const world = provided(strategy, { quote: { reserveUsd: "1", actualUsd: "1", mint: USDC } });
    const stored = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* StrategyRepository).save(strategy);
        const executed = yield* runTick(strategy);
        const loaded = yield* (yield* StrategyRepository).load(strategy.id);
        return { executed, state: loaded?.state };
      }).pipe(Effect.provide(world.layer)),
    );
    expect(stored.executed.outcome).toBe("executed");
    expect(stored.state).toBe("done");
  });

  test("an unsupported action fails before a reserve or a send", async () => {
    const action = {
      type: /** @type {const} */ ("lend"),
      protocol: /** @type {const} */ ("kamino"),
      market: USDC,
      mint: USDC,
      amount: "1000000",
    };
    const strategy = strategyOf({ params: { actions: [action] } });
    const world = provided(strategy);
    const recorded = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* StrategyRepository).save(strategy);
        const failed = yield* runTick(strategy);
        const probe = yield* (yield* CapLedger).reserve({
          strategyId: strategy.id,
          tickId: failed.tickId,
          intentId: "probe",
          notionalUsd: "10",
          mint: USDC,
        });
        return { failed, reserved: probe.reservationId };
      }).pipe(Effect.provide(world.layer)),
    );
    expect(recorded.failed.outcome).toBe("failed");
    expect(recorded.failed.intents).toHaveLength(0);
    expect(recorded.failed.remedy).toContain("transfer_sol");
    expect(recorded.failed.remedy).toContain("swap");
    expect(recorded.reserved).toBe("res_1");
  });
});
