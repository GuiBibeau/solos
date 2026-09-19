// @ts-check
import { Effect } from "effect";
import { SwapProvider } from "../ports/swap-provider.js";
import { validateSwapInput } from "./validate-input.js";

/**
 * Read an indicative swap quote. Input is re-validated here so every entry point — tool, CLI,
 * harness — fails with a domain error before any provider access, and the two mints must differ.
 * @param {import("../domain/types.js").SwapQuoteRequest} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").SwapQuote,
 *   import("../domain/errors.js").SwapQuoteError,
 *   SwapProviderShapeReq
 * >}
 * @typedef {import("../ports/swap-provider.js").SwapProviderShape} SwapProviderShapeReq
 */
export const getQuote = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSwapInput(input);
    return yield* (yield* SwapProvider).quote(request);
  }).pipe(Effect.withSpan("swap.getQuote"));
