// @ts-check
import { Effect } from "effect";
import { LendingInputInvalid } from "../domain/errors.js";
import { GetReserveInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";

/**
 * Read one mint's reserve in the configured Kamino market. Input is re-validated here so
 * every entry point — tool, CLI, harness — fails with a domain error before any RPC; input
 * that is not a 32-byte base58 address is not a mint, so it fails `LendingInputInvalid`
 * before the port is ever touched.
 * @param {import("../domain/types.js").GetReserveInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").ReserveSnapshot,
 *   import("../domain/errors.js").LendingError,
 *   LendingVenueShapeReq
 * >}
 * @typedef {import("../ports/lending-venue.js").LendingVenueShape} LendingVenueShapeReq
 */
export const getReserve = (input) =>
  Effect.gen(function* () {
    const parsed = GetReserveInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new LendingInputInvalid({
        reason: "mint must be a base58 Solana address that decodes to 32 bytes",
      });
    }
    return yield* (yield* LendingVenue).getReserve(parsed.data.mint);
  }).pipe(Effect.withSpan("lend.getReserve"));
