// @ts-check
import { Effect } from "effect";
import { CurveInputInvalid } from "../domain/errors.js";
import { GetCurveInputSchema } from "../domain/types.js";
import { LaunchVenue } from "../ports/launch-venue.js";

/**
 * Read one mint's bonding-curve state. Input is re-validated here so every entry point —
 * tool, CLI, harness — fails with a domain error before any RPC; input that is not a
 * 32-byte base58 address is not a mint, so it fails `CurveInputInvalid` before the port is
 * ever touched.
 * @param {import("../domain/types.js").GetCurveInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").LaunchCurve,
 *   import("../domain/errors.js").LaunchCurveError,
 *   LaunchVenueShapeReq
 * >}
 * @typedef {import("../ports/launch-venue.js").LaunchVenueShape} LaunchVenueShapeReq
 */
export const getCurve = (input) =>
  Effect.gen(function* () {
    const parsed = GetCurveInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new CurveInputInvalid({
        reason: "mint must be a base58 Solana address that decodes to 32 bytes",
      });
    }
    return yield* (yield* LaunchVenue).getCurve(parsed.data.mint);
  }).pipe(Effect.withSpan("launch.getCurve"));
