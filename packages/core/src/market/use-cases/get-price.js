// @ts-check
import { Effect } from "effect";
import { PriceInputInvalid } from "../domain/errors.js";
import { GetPriceInputSchema } from "../domain/types.js";
import { PriceFeed } from "../ports/price-feed.js";

/**
 * Read one token's USD price. Input is re-validated here so every entry point — tool, CLI,
 * harness — fails with a domain error before any provider access.
 * @param {import("../domain/types.js").GetPriceInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").TokenPrice,
 *   import("../domain/errors.js").PriceFeedError,
 *   PriceFeedShapeReq
 * >}
 * @typedef {import("../ports/price-feed.js").PriceFeedShape} PriceFeedShapeReq
 */
export const getPrice = (input) =>
  Effect.gen(function* () {
    const parsed = GetPriceInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new PriceInputInvalid({
        reason: "mint must be a base58 Solana address",
      });
    }
    return yield* (yield* PriceFeed).getPrice(parsed.data.mint);
  }).pipe(Effect.withSpan("market.getPrice"));
