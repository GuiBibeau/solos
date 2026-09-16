// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly publish: (event: import("../domain/event.js").SolosEvent) => import("effect").Effect.Effect<void>;
 *   readonly subscribe: () => import("effect").Effect.Effect<
 *     import("effect").Stream.Stream<import("../domain/event.js").SolosEvent>,
 *     never,
 *     import("effect").Scope.Scope
 *   >;
 * }} EventBusShape
 */

/** In-process by default; a broker is a Layer swap. */
export const EventBus = /** @type {Context.Tag<EventBusShape, EventBusShape>} */ (
  Context.GenericTag("@solos/shared/EventBus")
);
