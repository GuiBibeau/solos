// @ts-check
import { z } from "zod";
import { AddressSchema, DecimalSchema, TimestampSchema } from "./primitives.js";

/** Venues an allowlist may name. An empty list means any of these. */
export const BoundsVenueSchema = z
  .enum(["jupiter", "pump", "kamino", "meteora", "raydium", "orca", "phoenix"])
  .describe("A venue the Engine may use");

/** @typedef {z.infer<typeof BoundsVenueSchema>} BoundsVenue */

/** The venue list, in schema order. */
export const BOUNDS_VENUES = /** @type {ReadonlyArray<BoundsVenue>} */ (BoundsVenueSchema.options);

/**
 * A non-negative USD amount as a decimal string. Zero is a real cap: it admits no spend.
 * @param {string} description
 */
const usdCap = (description) =>
  DecimalSchema.refine((value) => !value.startsWith("-"), {
    message: "expected a non-negative decimal string",
  }).describe(description);

/**
 * Engine-wide Bounds: the limits an Operator sets on what the Engine may do, checked before any
 * transaction is built. An empty allowlist means any.
 */
export const EngineBoundsSchema = z
  .object({
    maxDailySpendUsd: usdCap(
      "Maximum USD the Engine may spend in one UTC day, as a non-negative decimal string",
    ),
    allowedMints: z.array(AddressSchema).describe("Mints the Engine may spend. Empty means any"),
    allowedVenues: z
      .array(BoundsVenueSchema)
      .describe("Venues the Engine may use. Empty means any"),
  })
  .describe("Engine-wide Bounds");

/** @typedef {z.infer<typeof EngineBoundsSchema>} EngineBounds */

/**
 * Per-strategy Bounds, the same vocabulary on a smaller scope. A strategy allowlist narrows the
 * Engine allowlist and never widens it. The schema carries the limits; the Engine enforces them.
 */
export const StrategyBoundsSchema = z
  .object({
    maxNotionalPerTickUsd: usdCap(
      "Maximum USD notional of one strategy tick, as a non-negative decimal string",
    ),
    maxDailySpendUsd: usdCap(
      "Maximum USD this strategy may spend in one UTC day, as a non-negative decimal string",
    ),
    allowedMints: z
      .array(AddressSchema)
      .describe(
        "Mints this strategy may spend. Empty means any mint the Engine already allows. Narrows the Engine allowlist and never widens it",
      ),
    expiresAt: TimestampSchema.describe(
      "Unix epoch milliseconds after which the strategy may no longer tick",
    ),
    maxConsecutiveFailures: z
      .number()
      .int()
      .nonnegative()
      .describe("Failed ticks in a row the strategy may absorb before it pauses"),
  })
  .describe("Per-strategy Bounds");

/** @typedef {z.infer<typeof StrategyBoundsSchema>} StrategyBounds */
