// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { LendingInputInvalid } from "../domain/errors.js";
import { ListLendPositionsInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";

/** @typedef {import("../domain/errors.js").LendingError | import("../../shared/index.js").SignerUnavailable} ListLendPositionsError */
/** @typedef {import("../ports/lending-venue.js").LendingVenueShape | import("../../wallet/index.js").SignerShape} ListLendPositionsContext */

/**
 * Complete ADR-0018 Kamino owner enumeration. The adapter fails instead of returning a
 * partial result when any account or result bound is exceeded.
 * @param {import("../domain/types.js").ListLendPositionsInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").LendEnumeration, ListLendPositionsError, ListLendPositionsContext>}
 */
export const listLendPositions = (input) =>
  Effect.gen(function* () {
    const parsed = ListLendPositionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new LendingInputInvalid({ reason: "owner must be a base58 Solana address" });
    }
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* LendingVenue).listPositions(owner);
  }).pipe(Effect.withSpan("lend.listPositions"));
