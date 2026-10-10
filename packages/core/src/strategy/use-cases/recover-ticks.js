// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";
import { intentIdFor } from "../domain/intent-id.js";
import { buildTick } from "../domain/tick-build.js";
import { CapLedger } from "../ports/cap-ledger.js";
import { IntentLookup } from "../ports/intent-lookup.js";
import { SpendMeter } from "../ports/spend-meter.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { TickSource } from "../ports/tick-source.js";
import { performEngineTransition } from "./perform-engine.js";

/** One missed Tick per Strategy, then settle any Tick that was in flight. Never replay. */
export const recoverTicks = () =>
  Effect.gen(function* () {
    const now = yield* (yield* StrategyIds).now();
    for (const strategy of yield* (yield* StrategyRepository).byState("active")) {
      yield* recoverStrategy(strategy, now);
    }
  }).pipe(Effect.withSpan("strategy.recoverTicks"));

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {number} now
 */
const recoverStrategy = (strategy, now) =>
  Effect.gen(function* () {
    const open = yield* (yield* TickRepository).list({
      strategyId: strategy.id,
      outcome: "in_flight",
      limit: 1,
    });
    if (open[0] !== undefined) return yield* recoverOpen(strategy, open[0], now);
    return yield* recoverMissed(strategy, now);
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {number} now
 */
const recoverMissed = (strategy, now) =>
  Effect.gen(function* () {
    if (strategy.nextDueAt == null || strategy.nextDueAt >= now) return;
    if (strategy.expiresAt != null && strategy.nextDueAt >= strategy.expiresAt) {
      return yield* performEngineTransition(strategy.id, "expired", "expiresAt has passed");
    }
    const tickId = yield* (yield* StrategyIds).ulid();
    yield* (yield* TickRepository).save(missedTick(strategy, tickId, now));
    yield* reschedule(strategy, now);
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {import("../domain/tick.js").Tick} tick
 * @param {number} now
 */
const recoverOpen = (strategy, tick, now) =>
  Effect.gen(function* () {
    /** @type {import("../domain/tick.js").TickIntent[]} */
    const intents = [];
    const steps = tick.actions.length;
    for (let step = 0; step < steps; step += 1) {
      const view = yield* (yield* IntentLookup).lookup(intentIdFor(strategy.id, tick.tickId, step));
      if (view.state === "missing") break;
      intents.push(yield* reconcile(strategy.id, tick, step, view));
      if (view.state !== "settled") break;
    }
    const outcome = folded(intents, tick.actions.length);
    yield* (yield* TickRepository).save(closedTick({ tick, intents, outcome, now }));
    if (outcome !== "in_flight") yield* reschedule(strategy, now);
  });

/**
 * @param {string} strategyId
 * @param {import("../domain/tick.js").Tick} tick
 * @param {number} step
 * @param {import("../ports/intent-lookup.js").IntentView} view
 */
const reconcile = (strategyId, tick, step, view) =>
  Effect.gen(function* () {
    const priced = yield* notionalOf(tick, step);
    const row = intentRow({ strategyId, tick, step, view, priced });
    if (view.state === "settled" || view.state === "in_flight") {
      yield* restoreHold(strategyId, { ...row, tickId: tick.tickId }, view.state === "settled");
    }
    return row;
  });

/**
 * @param {string} strategyId
 * @param {import("../domain/tick.js").TickIntent & { readonly tickId: string }} row
 * @param {boolean} settle
 */
const restoreHold = (strategyId, row, settle) =>
  Effect.gen(function* () {
    const ledger = yield* CapLedger;
    const held = yield* ledger.reserve({
      strategyId,
      tickId: row.tickId,
      intentId: row.intentId,
      notionalUsd: row.notionalUsd ?? "0",
      mint: row.mint ?? WSOL_MINT,
    });
    if (settle) yield* ledger.settle(held.reservationId, row.notionalUsd ?? "0");
  });

/**
 * @param {{
 *   strategyId: string;
 *   tick: import("../domain/tick.js").Tick;
 *   step: number;
 *   view: import("../ports/intent-lookup.js").IntentView;
 *   priced: { notionalUsd: string; mint: string };
 * }} input
 * @returns {import("../domain/tick.js").TickIntent}
 */
const intentRow = (input) => ({
  intentId: intentIdFor(input.strategyId, input.tick.tickId, input.step),
  state: storedState(input.view.state),
  ...(input.view.signature != null ? { signature: input.view.signature } : {}),
  notionalUsd: input.priced.notionalUsd,
  mint: input.priced.mint,
});

/**
 * Prefer the notional stored on the Tick. Otherwise price the Action again.
 * @param {import("../domain/tick.js").Tick} tick
 * @param {number} step
 */
const notionalOf = (tick, step) =>
  Effect.gen(function* () {
    const stored = tick.intents[step];
    if (stored?.notionalUsd !== undefined) {
      return { notionalUsd: stored.notionalUsd, mint: stored.mint ?? WSOL_MINT };
    }
    const action = tick.actions[step];
    if (action === undefined) return { notionalUsd: "0", mint: WSOL_MINT };
    const quoted = yield* (yield* SpendMeter).quote(action).pipe(Effect.either);
    if (quoted._tag === "Left") return { notionalUsd: "0", mint: WSOL_MINT };
    return { notionalUsd: quoted.right.reserveUsd, mint: quoted.right.mint };
  });

/** @param {string} state @returns {"in_flight" | "settled" | "failed"} */
const storedState = (state) => (state === "settled" || state === "failed" ? state : "in_flight");

/**
 * A missing later step is a failure. An open Intent stays in flight and keeps its hold.
 * @param {ReadonlyArray<{ state: string }>} intents
 * @param {number} steps
 * @returns {import("../domain/tick.js").TickOutcome}
 */
const folded = (intents, steps) => {
  if (intents.some((intent) => intent.state === "in_flight")) return "in_flight";
  if (intents.length === 0 || intents.length < steps) return "failed";
  if (intents.some((intent) => intent.state === "failed")) return "failed";
  return "executed";
};

/**
 * @param {{
 *   tick: import("../domain/tick.js").Tick;
 *   intents: ReadonlyArray<import("../domain/tick.js").TickIntent>;
 *   outcome: import("../domain/tick.js").TickOutcome;
 *   now: number;
 * }} input
 */
const closedTick = (input) => ({
  ...input.tick,
  outcome: input.outcome,
  intents: input.intents,
  finishedAt: input.outcome === "in_flight" ? null : input.now,
  ...(input.outcome === "failed"
    ? { step: input.intents.length, reason: input.tick.reason ?? "the in-flight tick did not settle" }
    : {}),
});

/** @param {import("@solos-sh/actions").Strategy} strategy @param {number} now */
const reschedule = (strategy, now) =>
  Effect.gen(function* () {
    const nextDueAt = (yield* (yield* TickSource).nextDue(strategy, now)) ?? null;
    yield* (yield* StrategyRepository).save({ ...strategy, nextDueAt });
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {string} tickId
 * @param {number} now
 */
const missedTick = (strategy, tickId, now) =>
  buildTick({
    tickId,
    strategyId: strategy.id,
    dueAt: strategy.nextDueAt ?? now,
    startedAt: now,
    finishedAt: now,
    outcome: "missed",
    observations: {},
    actions: [],
    intents: [],
    note: "the engine was down when this tick was due",
  });
