// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityListPositionsInputSchema } from "../domain/types.js";
import { LiquidityVenue } from "../ports/liquidity-venue.js";

/** @typedef {import("../domain/errors.js").LiquidityError | import("../../wallet/index.js").SignerUnavailable | import("../../shared/index.js").RpcError} ListPositionsError */
/** @typedef {import("../ports/liquidity-venue.js").LiquidityVenueShape | import("../../wallet/index.js").SignerShape} ListPositionsContext */

/**
 * Enumerate one owner's LP positions (ADR-0018 shape). Complete or failed: bounds raise
 * LiquidityEnumerationIncomplete, never a partial array. The protocol gate runs before the
 * signer or the venue port are touched.
 * @param {import("../domain/types.js").LiquidityListPositionsInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").LiquidityEnumeration, ListPositionsError, ListPositionsContext>}
 */
export const listLpPositions = (input) =>
  Effect.gen(function* () {
    const parsed = LiquidityListPositionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new LiquidityInputInvalid({
        reason: "protocol must be orca, meteora or raydium and owner a base58 address when given",
      });
    }
    if (parsed.data.protocol !== "orca") {
      return yield* new LiquidityUnsupportedProtocol({ protocol: parsed.data.protocol });
    }
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* LiquidityVenue).listPositions({
      protocol: parsed.data.protocol,
      owner,
    });
  }).pipe(Effect.withSpan("liquidity.listPositions"));
