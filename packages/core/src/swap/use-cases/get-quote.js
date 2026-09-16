// @ts-check
import { Effect } from "effect";
import { SwapProvider } from "../ports/swap-provider.js";

/** @param {import("../domain/types.js").SwapQuoteRequest} request */
export const getQuote = (request) =>
  Effect.gen(function* () {
    return yield* (yield* SwapProvider).quote(request);
  }).pipe(Effect.withSpan("swap.getQuote"));
