// @ts-check
import { Context } from "effect";

/**
 * Verified decimals for one mint. `undefined` means the account could not be read as an
 * initialized mint. The reader never substitutes a default.
 * @typedef {{
 *   readonly decimalsOf: (mint: string) => import("effect").Effect.Effect<number | undefined>;
 * }} MintDecimalsShape
 */

export const MintDecimals = /** @type {Context.Tag<MintDecimalsShape, MintDecimalsShape>} */ (
  Context.GenericTag("@solos/strategy/MintDecimals")
);
