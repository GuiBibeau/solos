// @ts-check
import { z } from "zod";
import { AddressSchema, DecimalSchema, TimestampSchema } from "./primitives.js";

/**
 * Non-negative USD as a decimal string. Zero is a real cap: it admits no spend.
 * @param {string} description
 */
const nonNegativeUsd = (description) =>
  DecimalSchema.refine((value) => !value.startsWith("-"), "USD cap must be non-negative").describe(
    description,
  );

/**
 * Per-Strategy Bounds a Strategy carries on the wire. The Engine enforces them as a Caller
 * (ADR-0037).
 */
export const StrategyBoundsSchema = z
  .object({
    maxNotionalPerTickUsd: nonNegativeUsd("Maximum Notional, in USD, of one tick of this Strategy"),
    maxDailySpendUsd: nonNegativeUsd(
      "Maximum USD this Strategy may reserve during the current UTC day",
    ),
    allowedMints: z
      .array(AddressSchema)
      .describe(
        "Mints this Strategy may spend. Empty means any mint the Engine allowlist already permits. A Strategy allowlist narrows the Engine allowlist and never widens it",
      ),
    expiresAt: TimestampSchema.nullable().describe(
      "Unix epoch milliseconds when these bounds stop authorizing spends; null means no clock expiry",
    ),
    maxConsecutiveFailures: z
      .number()
      .int()
      .min(1)
      .describe("Failed ticks in a row after which the Strategy is failed; at least 1"),
  })
  .describe("Limits on what one Strategy may spend");

/** @typedef {z.infer<typeof StrategyBoundsSchema>} StrategyBounds */
