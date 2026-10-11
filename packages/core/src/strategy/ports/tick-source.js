// @ts-check
import { Context } from "effect";

/**
 * The next due instant for a Strategy. A clock provides it today. A stream would provide the
 * same answer later, so the interface stays that one question.
 * @typedef {{
 *   readonly nextDue: (
 *     strategy: import("@solos-sh/actions").Strategy,
 *     now: number,
 *   ) => import("effect").Effect.Effect<number | undefined>;
 * }} TickSourceShape
 */

export const TickSource = /** @type {Context.Tag<TickSourceShape, TickSourceShape>} */ (
  Context.GenericTag("@solos/strategy/TickSource")
);
