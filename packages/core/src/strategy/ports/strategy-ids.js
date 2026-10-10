// @ts-check
import { Context } from "effect";

/**
 * Clock and ULID source the Registry uses when it stores a Strategy.
 * @typedef {{
 *   readonly ulid: () => import("effect").Effect.Effect<string>;
 *   readonly now: () => import("effect").Effect.Effect<number>;
 * }} StrategyIdsShape
 */

export const StrategyIds = /** @type {Context.Tag<StrategyIdsShape, StrategyIdsShape>} */ (
  Context.GenericTag("@solos/strategy/StrategyIds")
);
