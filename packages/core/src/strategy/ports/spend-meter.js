// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly reserveUsd: string;
 *   readonly actualUsd: string;
 *   readonly mint: string;
 * }} SpendQuote
 */

/**
 * Worst-case reservation and the measured spend for one Action, both USD decimal strings.
 * @typedef {{
 *   readonly quote: (
 *     action: import("@solos-sh/actions").Action,
 *   ) => import("effect").Effect.Effect<SpendQuote, unknown>;
 * }} SpendMeterShape
 */

export const SpendMeter = /** @type {Context.Tag<SpendMeterShape, SpendMeterShape>} */ (
  Context.GenericTag("@solos/strategy/SpendMeter")
);
