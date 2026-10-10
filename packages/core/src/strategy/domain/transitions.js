// @ts-check
import { StrategyTransitionRefused } from "./errors.js";

/** @typedef {import("@solos-sh/actions").StrategyState} StrategyState */
/** @typedef {"caller" | "engine"} StrategyActor */

/** Caller requests: pause, resume, and cancel (cancel is `done` on the wire). */
const CALLER = {
  active: ["paused", "done"],
  paused: ["active", "done"],
};

/** Moves only the Engine makes. Child 7 is what performs them. */
const ENGINE = {
  active: ["expired", "failed", "done"],
};

/**
 * @param {string} from
 * @param {string} to
 * @param {StrategyActor} actor
 */
const allowed = (from, to, actor) => {
  const table = actor === "engine" ? ENGINE : CALLER;
  return (table[/** @type {keyof typeof table} */ (from)] ?? []).includes(to);
};

/**
 * The state table. Returns a refusal carrying `from` and `to`, or undefined when the move is allowed.
 * @param {{ id: string; from: string; to: string; actor: StrategyActor }} move
 */
export const refusalFor = (move) => {
  if (allowed(move.from, move.to, move.actor)) return undefined;
  return new StrategyTransitionRefused({ id: move.id, from: move.from, to: move.to });
};
