// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly reserveUsd: string;
 *   readonly actualUsd: string;
 *   readonly mint: string;
 *   readonly solPriceUsd?: string;
 *   readonly unverified?: boolean;
 * }} SpendQuote
 */

/**
 * Prices and the position value a liquidity quote can use instead of reading them again.
 * @typedef {{
 *   readonly redeposit?: boolean;
 *   readonly valueUsd?: string;
 *   readonly mint?: string;
 *   readonly priceA?: string;
 *   readonly priceB?: string;
 *   readonly decimalsA?: number;
 *   readonly decimalsB?: number;
 * }} SpendContext
 */

/**
 * Worst-case reservation and the measured spend for one Action, both USD decimal strings.
 * @typedef {{
 *   readonly quote: (
 *     action: import("@solos-sh/actions").Action,
 *     context?: SpendContext,
 *   ) => import("effect").Effect.Effect<SpendQuote, unknown>;
 * }} SpendMeterShape
 */

export const SpendMeter = /** @type {Context.Tag<SpendMeterShape, SpendMeterShape>} */ (
  Context.GenericTag("@solos/strategy/SpendMeter")
);
