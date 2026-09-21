// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { PerpInputInvalid } from "../domain/errors.js";
import { normalizeMarketSymbol } from "../domain/symbol.js";
import { GetPositionInputSchema } from "../domain/types.js";
import { PerpVenue } from "../ports/perp-venue.js";

/** @typedef {import("../domain/errors.js").PerpError | import("../../shared/index.js").SignerUnavailable} GetPositionError */
/** @typedef {import("../ports/perp-venue.js").PerpVenueShape | import("../../wallet/index.js").SignerShape} GetPositionContext */

/**
 * Read one Phoenix perp position with explicit side and the trader account equity. Input is
 * re-validated so every entry point — tool, CLI, harness — fails before any provider access,
 * and the owner resolves from the wallet Signer only when omitted. Explicit owners are passed
 * through verbatim.
 * @param {import("../domain/types.js").GetPositionInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").GetPositionResult, GetPositionError, GetPositionContext>}
 */
export const getPosition = (input) =>
  Effect.gen(function* () {
    const parsed = GetPositionInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new PerpInputInvalid({
        reason: "market must be a symbol like SOL or SOL-PERP and owner a base58 address",
      });
    }
    const market = yield* Effect.try({
      try: () => normalizeMarketSymbol(parsed.data.market),
      catch: (error) => /** @type {PerpInputInvalid} */ (error),
    });
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* PerpVenue).getPosition({ market, owner });
  }).pipe(Effect.withSpan("perp.getPosition"));
