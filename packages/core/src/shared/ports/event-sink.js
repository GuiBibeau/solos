// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly append: (event: import("../domain/event.js").SolosEvent) => import("effect").Effect.Effect<void>;
 * }} EventSinkShape
 */

/** Durable destination for events. A no-op in the foundation. */
export const EventSink = /** @type {Context.Tag<EventSinkShape, EventSinkShape>} */ (
  Context.GenericTag("@solos/shared/EventSink")
);
