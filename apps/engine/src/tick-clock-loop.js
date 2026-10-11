// @ts-check
import { StrategyRepository, TickRepository } from "@solos/core/strategy";
import { Effect } from "effect";
import { openBudget } from "./tick-clock-chain.js";
import { reconcileOneTick } from "./tick-clock-one.js";

/** @typedef {import("./http.js").EngineDeps["runtime"]} TickRuntime */

/** Ticks whose reconcile is in progress. A second pass skips them instead of settling twice. */
const claimedTicks = new Set();

/**
 * One clock pass: in-flight Ticks with a persisted signature are reconciled, then the caller
 * runs due ticks. The same function runs at boot.
 * @param {TickRuntime} runtime
 * @param {import("bun:sqlite").Database} db
 */
export const reconcileOpenTicks = async (runtime, db) => {
  const open = await runtime.runPromise(listOpen());
  const budget = openBudget();
  /** @type {string[]} */
  const claimed = [];
  try {
    for (const row of open) {
      if (budget.left === 0) break;
      if (!claimTick(row.tick.tickId)) continue;
      claimed.push(row.tick.tickId);
      await oneTick(runtime, db, { ...row, budget });
    }
  } finally {
    for (const tickId of claimed) claimedTicks.delete(tickId);
  }
};

/**
 * @param {string} tickId
 */
const claimTick = (tickId) => {
  if (claimedTicks.has(tickId)) return false;
  claimedTicks.add(tickId);
  return true;
};

/**
 * @param {TickRuntime} runtime
 * @param {import("bun:sqlite").Database} db
 * @param {Parameters<typeof reconcileOneTick>[2]} work
 */
const oneTick = async (runtime, db, work) => {
  try {
    await reconcileOneTick(runtime, db, work);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "tick reconcile failed";
    process.stderr.write(`${JSON.stringify({ message: "tick reconcile failed", reason })}\n`);
  }
};

const listOpen = () =>
  Effect.gen(function* () {
    const active = yield* (yield* StrategyRepository).byState("active");
    /** @type {{ strategy: import("@solos-sh/actions").Strategy; tick: import("@solos/core/strategy").Tick }[]} */
    const found = [];
    for (const strategy of active) found.push(...(yield* openTicks(strategy)));
    return found;
  });

/** @param {import("@solos-sh/actions").Strategy} strategy */
const openTicks = (strategy) =>
  Effect.gen(function* () {
    const ticks = yield* (yield* TickRepository).list({
      strategyId: strategy.id,
      outcome: "in_flight",
      limit: 8,
    });
    return ticks.map((tick) => ({ strategy, tick }));
  });
