// @ts-check
import { Effect } from "effect";
import { PerpInputInvalid } from "../domain/errors.js";
import { GetFundingInputSchema } from "../domain/funding.js";
import { normalizeMarketSymbol } from "../domain/symbol.js";
import { PerpVenue } from "../ports/perp-venue.js";

const INPUT_REASON =
  "market must be a symbol like SOL or SOL-PERP and lookbackHours an integer from 1 to 168";
const INPUT_REMEDY = "pass market like SOL-PERP and lookbackHours between 1 and 168";

/**
 * Read one market's Phoenix funding rate and its lookback. Public: no signer. Input is
 * re-validated so the tool, the CLI and the harness fail before any provider access.
 * @param {import("zod").input<typeof GetFundingInputSchema>} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/funding.js").FundingSnapshot,
 *   import("../domain/errors.js").PerpError,
 *   import("../ports/perp-venue.js").PerpVenueShape
 * >}
 */
export const getFunding = (input) =>
  Effect.gen(function* () {
    const parsed = GetFundingInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new PerpInputInvalid({ reason: INPUT_REASON, remedy: INPUT_REMEDY });
    }
    const market = yield* Effect.try({
      try: () => normalizeMarketSymbol(parsed.data.market),
      catch: (error) => /** @type {PerpInputInvalid} */ (error),
    });
    return yield* (yield* PerpVenue).getFunding({
      market,
      lookbackHours: parsed.data.lookbackHours,
    });
  }).pipe(Effect.withSpan("perp.getFunding"));
