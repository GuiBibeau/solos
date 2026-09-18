// @ts-check
import { Effect } from "effect";
import { QuoteInputInvalid } from "../domain/errors.js";
import { SwapQuoteRequestSchema } from "../domain/types.js";
import { SwapProvider } from "../ports/swap-provider.js";

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
    const parsed = SwapQuoteRequestSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new QuoteInputInvalid({
        reason:
          "mints must be base58 Solana addresses that decode to 32 bytes and amount a positive " +
          "integer string in base units",
      });
    }
    if (parsed.data.inputMint === parsed.data.outputMint) {
      return yield* new QuoteInputInvalid({ reason: "inputMint and outputMint must differ" });
    }
    return yield* (yield* SwapProvider).quote(parsed.data);
  }).pipe(Effect.withSpan("swap.getQuote"));
