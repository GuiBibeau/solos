// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly strategyId: string;
 *   readonly limit?: number;
 *   readonly outcome?: string;
 * }} TickQuery
 */

/**
 * Append-only Tick record. `recent` is the in-memory window. `list` is the complete record.
 * @typedef {{
 *   readonly save: (tick: import("../domain/tick.js").Tick) => import("effect").Effect.Effect<void>;
 *   readonly list: (query: TickQuery) => import("effect").Effect.Effect<ReadonlyArray<import("../domain/tick.js").Tick>>;
 *   readonly recent: (strategyId: string) => import("effect").Effect.Effect<ReadonlyArray<import("../domain/tick.js").Tick>>;
 * }} TickRepositoryShape
 */

export const TickRepository = /** @type {Context.Tag<TickRepositoryShape, TickRepositoryShape>} */ (
  Context.GenericTag("@solos/strategy/TickRepository")
);
