// @ts-check
import { Effect } from "effect";
import { PriceFeed } from "../ports/price-feed.js";

/** @param {import("../../shared/domain/address.js").Address} mint */
export const getPrice = (mint) =>
  Effect.gen(function* () {
    return yield* (yield* PriceFeed).getPrice(mint);
  }).pipe(Effect.withSpan("market.getPrice"));
