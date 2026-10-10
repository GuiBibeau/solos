// @ts-check
import { Context } from "effect";

/** @typedef {{ readonly state?: string; readonly owner?: string }} StrategyFilter */

/**
 * Persistence for Strategies. The Engine provides SQLite. Tests provide the in-memory adapter.
 * @typedef {{
 *   readonly save: (strategy: import("@solos-sh/actions").Strategy) => import("effect").Effect.Effect<void>;
 *   readonly load: (id: string) => import("effect").Effect.Effect<import("@solos-sh/actions").Strategy | undefined>;
 *   readonly list: (filter: StrategyFilter) => import("effect").Effect.Effect<ReadonlyArray<import("@solos-sh/actions").Strategy>>;
 *   readonly byState: (state: string) => import("effect").Effect.Effect<ReadonlyArray<import("@solos-sh/actions").Strategy>>;
 * }} StrategyRepositoryShape
 */

export const StrategyRepository =
  /** @type {Context.Tag<StrategyRepositoryShape, StrategyRepositoryShape>} */ (
    Context.GenericTag("@solos/strategy/StrategyRepository")
  );
