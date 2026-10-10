// @ts-check
import { Context } from "effect";

/**
 * What the strategy tools call. The in-process adapter runs the use cases. The HTTP adapter
 * forwards them. Neither one carries the state table.
 * @typedef {{
 *   readonly register: (draft: unknown) => import("effect").Effect.Effect<
 *     { id: string; state: string },
 *     import("../domain/errors.js").StrategyInvalid | import("../../shared/domain/engine-errors.js").BoundsExceeded,
 *     never
 *   >;
 *   readonly update: (id: string, state: string) => import("effect").Effect.Effect<
 *     { id: string; state: string },
 *     import("../domain/errors.js").StrategyNotFound | import("../domain/errors.js").StrategyTransitionRefused,
 *     never
 *   >;
 *   readonly list: (filter: { state?: string; owner?: string }) => import("effect").Effect.Effect<
 *     { strategies: ReadonlyArray<import("@solos-sh/actions").Strategy> },
 *     import("../domain/errors.js").StrategyInvalid,
 *     never
 *   >;
 *   readonly get: (id: string) => import("effect").Effect.Effect<
 *     import("@solos-sh/actions").Strategy & {
 *       readonly lastTick: import("../domain/tick.js").Tick | null;
 *       readonly nextDueAt: number | null;
 *     },
 *     import("../domain/errors.js").StrategyNotFound,
 *     never
 *   >;
 *   readonly ticks: (input: {
 *     readonly id: string;
 *     readonly limit?: number;
 *     readonly outcome?: string;
 *   }) => import("effect").Effect.Effect<
 *     { readonly ticks: ReadonlyArray<import("../domain/tick.js").Tick> },
 *     import("../domain/errors.js").StrategyNotFound | import("../domain/errors.js").StrategyInvalid,
 *     never
 *   >;
 *   readonly simulateRegister: (draft: unknown) => import("effect").Effect.Effect<
 *     { price: { mint: string; priceUsd: string; source: string; at: number } | null; actions: ReadonlyArray<unknown> },
 *     unknown,
 *     never
 *   >;
 *   readonly simulateUpdate: (id: string, state: string) => import("effect").Effect.Effect<
 *     { allowed: boolean; state: string; refusal?: Record<string, unknown> },
 *     import("../domain/errors.js").StrategyNotFound,
 *     never
 *   >;
 * }} StrategyRegistryShape
 */

export const StrategyRegistry =
  /** @type {Context.Tag<StrategyRegistryShape, StrategyRegistryShape>} */ (
    Context.GenericTag("@solos/strategy/StrategyRegistry")
  );
