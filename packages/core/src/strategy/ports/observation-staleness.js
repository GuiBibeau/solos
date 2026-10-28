// @ts-check
import { Context } from "effect";

/**
 * How old a price may be before a trigger Tick skips it. The default is two tick intervals.
 * An absolute millisecond override wins when the Operator sets one.
 * @typedef {{
 *   readonly limitMs: (strategy: import("@solos-sh/actions").Strategy) => number;
 * }} ObservationStalenessShape
 */

export const ObservationStaleness =
  /** @type {Context.Tag<ObservationStalenessShape, ObservationStalenessShape>} */ (
    Context.GenericTag("@solos/strategy/ObservationStaleness")
  );
