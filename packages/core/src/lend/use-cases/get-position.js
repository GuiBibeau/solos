// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { LendingInputInvalid } from "../domain/errors.js";
import { GetLendPositionInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";

/** @typedef {import("../domain/errors.js").LendingError | import("../../shared/index.js").SignerUnavailable} GetLendPositionError */
/** @typedef {import("../ports/lending-venue.js").LendingVenueShape | import("../../wallet/index.js").SignerShape} GetLendPositionContext */

/**
 * Read one mint's Kamino supply. Explicit owners never touch the signer; omitted owners
 * resolve once from the active signer before the venue read.
 * @param {import("../domain/types.js").GetLendPositionInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").LendPosition, GetLendPositionError, GetLendPositionContext>}
 */
export const getLendPosition = (input) =>
  Effect.gen(function* () {
    const parsed = GetLendPositionInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new LendingInputInvalid({
        reason: "mint and owner must be base58 Solana addresses that decode to 32 bytes",
      });
    }
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* LendingVenue).getPosition({ mint: parsed.data.mint, owner });
  }).pipe(Effect.withSpan("lend.getPosition"));
