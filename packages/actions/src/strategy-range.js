// @ts-check
import { z } from "zod";
import { AddressSchema } from "./primitives.js";
import { SlippageBpsSchema } from "./trading-primitives.js";

/**
 * Parameters for a range Strategy: one Meteora DLMM position kept centred on the active bin.
 * `recenterWhenOutsideFor` is a consecutive-tick debounce. `maxRecentersPerDay` is this kind's
 * own budget, counted in UTC days, in addition to the Engine caps.
 */
export const RangeParamsSchema = z
  .object({
    protocol: z.literal("meteora").describe("DLMM protocol; Meteora in v1"),
    pool: AddressSchema.describe("Meteora DLMM LbPair pool address"),
    position: AddressSchema.describe("PositionV2 account address the Strategy currently manages"),
    width: z.number().int().min(1).max(70).describe("Replacement position width in bins (1 to 70)"),
    recenterWhenOutsideFor: z
      .number()
      .int()
      .min(1)
      .describe(
        "Consecutive ticks active bin must be outside the position range before recentering",
      ),
    maxRecentersPerDay: z
      .number()
      .int()
      .min(1)
      .max(24)
      .describe("Maximum recenters allowed per UTC day"),
    maxSlippageBps: SlippageBpsSchema.default(50).describe(
      "Maximum slippage in bps (0 to 9999, default 50) for liquidity withdrawal and deposit",
    ),
  })
  .describe("Parameters for a range Strategy");

/** @typedef {z.infer<typeof RangeParamsSchema>} RangeParams */
