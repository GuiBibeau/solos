// @ts-check
import { Effect } from "effect";
import { QuoteInputInvalid } from "../domain/errors.js";
import { SwapQuoteRequestSchema } from "../domain/types.js";

/**
 * Validate a swap intent identically for every entry point — tool, CLI, harness — before any
 * provider or executor access: schema first, then the cross-field rule that the mints differ.
 * @param {unknown} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").SwapQuoteRequest,
 *   import("../domain/errors.js").QuoteInputInvalid
 * >}
 */
export const validateSwapInput = (input) =>
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
    return parsed.data;
  });
