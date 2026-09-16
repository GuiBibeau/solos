// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly source: string;
 *   readonly getPrice: (mint: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").TokenPrice, import("../domain/errors.js").PriceUnavailable>;
 * }} PriceFeedShape
 */

export const PriceFeed = /** @type {Context.Tag<PriceFeedShape, PriceFeedShape>} */ (
  Context.GenericTag("@solos/market/PriceFeed")
);
