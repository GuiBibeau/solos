// @ts-check
import { Effect } from "effect";
import { carrySpendContext } from "../domain/carry-plan.js";
import { intentIdFor } from "../domain/intent-id.js";
import { outcomeWhenStopped } from "../domain/tick.js";
import { quoteContext } from "./range-handoff.js";
import { absorb } from "./run-actions-absorb.js";
import { runStep } from "./run-step.js";

/**
 * @typedef {{
 *   readonly outcome: import("../domain/tick.js").TickOutcome;
 *   readonly intents: import("../domain/tick.js").TickIntent[];
 *   readonly reason?: string;
 *   readonly remedy?: string;
 *   readonly step?: number;
 *   readonly opened?: string;
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 * }} ActionRun
 */

/**
 * Run a tick's actions in order. A removal's amounts fill the later deposit.
 * An open's position becomes the Strategy's position before the deposit is sent.
 * The first failure stops the tick and names the step, the action, and the Intent.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{ tickId: string; now: number; observations: Readonly<Record<string, string | number>>; decision: { actions: ReadonlyArray<import("@solos-sh/actions").Action> } }} input
 */
export const executeActions = (strategy, input) =>
  Effect.gen(function* () {
    const book = emptyBook(input.decision.actions);
    for (const [index, action] of book.actions.entries()) {
      if (action === undefined) continue;
      const stop = yield* advance({ strategy, input, book, index, action });
      if (stop !== undefined) return stopped(book.actions, book.intents, stop);
    }
    return finished(book);
  });

/**
 * @param {ReadonlyArray<import("@solos-sh/actions").Action>} planned
 */
const emptyBook = (planned) => ({
  /** @type {(import("@solos-sh/actions").Action | undefined)[]} */
  actions: planned.map((action) => action),
  /** @type {import("../domain/tick.js").TickIntent[]} */
  intents: [],
  /** @type {string | undefined} */
  opened: undefined,
  /** @type {string | undefined} */
  reason: undefined,
  /** @type {string | undefined} */
  remedy: undefined,
});

/**
 * @param {{
 *   strategy: import("@solos-sh/actions").Strategy;
 *   input: { tickId: string; now: number; observations: Readonly<Record<string, string | number>> };
 *   book: ReturnType<typeof emptyBook>;
 *   index: number;
 *   action: import("@solos-sh/actions").Action;
 * }} step
 */
const advance = (step) =>
  Effect.gen(function* () {
    const result = yield* oneStep(handed(step));
    if (result.intent) step.book.intents.push(result.intent);
    noteExecuted(step.book, result);
    const absorbed = yield* absorb({ ...handed(step), result });
    step.book.opened = absorbed.opened ?? step.book.opened;
    if (!absorbed.stop) return undefined;
    return halt(step, absorbed, result.outcome);
  });

/**
 * @param {{
 *   strategy: import("@solos-sh/actions").Strategy;
 *   input: { tickId: string; now: number; observations: Readonly<Record<string, string | number>> };
 *   book: ReturnType<typeof emptyBook>;
 *   index: number;
 *   action: import("@solos-sh/actions").Action;
 * }} step
 */
const handed = (step) => ({
  strategy: step.strategy,
  input: step.input,
  actions: step.book.actions,
  index: step.index,
  action: step.action,
});

/**
 * @param {{ book: ReturnType<typeof emptyBook>; index: number }} step
 * @param {{ stop?: boolean; opened?: string; reason?: string; remedy?: string }} absorbed
 * @param {import("../domain/tick.js").TickOutcome} outcome
 */
const halt = (step, absorbed, outcome) => ({
  ...absorbed,
  opened: step.book.opened,
  outcome,
  index: step.index,
  ...(step.book.reason !== undefined && { reason: step.book.reason, remedy: step.book.remedy }),
});

/**
 * @param {ReturnType<typeof emptyBook>} book
 * @param {import("./run-step.js").StepResult} result
 */
const noteExecuted = (book, result) => {
  if (result.outcome !== "executed" || book.reason !== undefined || result.reason === undefined) {
    return;
  }
  book.reason = result.reason;
  book.remedy = result.remedy;
};

/** @param {ReturnType<typeof emptyBook>} book @returns {ActionRun} */
const finished = (book) => ({
  outcome: "executed",
  intents: book.intents,
  opened: book.opened,
  actions: kept(book.actions),
  ...(book.reason !== undefined && { reason: book.reason, remedy: book.remedy }),
});

/**
 * @param {{
 *   strategy: import("@solos-sh/actions").Strategy;
 *   input: { tickId: string; observations: Readonly<Record<string, string | number>> };
 *   actions: readonly (import("@solos-sh/actions").Action | undefined)[];
 *   index: number;
 *   action: import("@solos-sh/actions").Action;
 * }} step
 */
const oneStep = (step) =>
  runStep({
    strategyId: step.strategy.id,
    tickId: step.input.tickId,
    intentId: intentIdFor(step.strategy.id, step.input.tickId, step.index),
    action: step.action,
    context:
      quoteContext(step.action, step.input.observations, priorTypes(step.actions, step.index)) ??
      carrySpendContext(step.action, step.input.observations),
  });

/**
 * @param {(import("@solos-sh/actions").Action | undefined)[]} actions
 * @param {import("../domain/tick.js").TickIntent[]} intents
 * @param {{ outcome: import("../domain/tick.js").TickOutcome; index: number; reason?: string; remedy?: string; opened?: string }} stop
 * @returns {ActionRun}
 */
const stopped = (actions, intents, stop) => ({
  outcome: outcomeWhenStopped(stop.outcome, intents.length),
  intents,
  ...(stop.reason !== undefined && { reason: stop.reason }),
  ...(stop.remedy !== undefined && { remedy: stop.remedy }),
  step: stop.index,
  opened: stop.opened,
  actions: kept(actions),
});

/** @param {readonly (import("@solos-sh/actions").Action | undefined)[]} actions @param {number} index */
const priorTypes = (actions, index) =>
  actions.slice(0, index).flatMap((action) => (action === undefined ? [] : [action.type]));

/** @param {readonly (import("@solos-sh/actions").Action | undefined)[]} actions */
const kept = (actions) => actions.flatMap((action) => (action === undefined ? [] : [action]));
