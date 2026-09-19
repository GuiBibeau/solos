// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { PerpInputInvalid } from "../domain/errors.js";
import { ListPositionsInputSchema } from "../domain/types.js";
import { PerpVenue } from "../ports/perp-venue.js";

/** @typedef {import("../domain/errors.js").PerpError | import("../../wallet/index.js").SignerUnavailable} ListPositionsError */
/** @typedef {import("../ports/perp-venue.js").PerpVenueShape | import("../../wallet/index.js").SignerShape} ListPositionsContext */

/**
 * Enumerate one owner's Phoenix perp positions (ADR-0018 shape). Complete or failed: bounds
 * raise PerpEnumerationIncomplete, never a partial array, and the shared account equity is
 * returned exactly once even when the account is flat.
 * @param {import("../domain/types.js").ListPositionsInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").PerpEnumeration, ListPositionsError, ListPositionsContext>}
 */
export const listPositions = (input) =>
  Effect.gen(function* () {
    const parsed = ListPositionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new PerpInputInvalid({ reason: "owner must be a base58 address when given" });
    }
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* PerpVenue).listPositions(owner);
  }).pipe(Effect.withSpan("perp.listPositions"));
