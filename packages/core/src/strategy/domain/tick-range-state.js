// @ts-check
import { z } from "zod";

/** Kind state a range tick records. Spread into `TickSchema.shape.state`. */
export const rangeTickFields = {
  activeId: z.number().int().optional().describe("Meteora active bin id at this tick"),
  lowerBinId: z.number().int().optional().describe("Position lower bin id, inclusive"),
  upperBinId: z.number().int().optional().describe("Position upper bin id, inclusive"),
  position: z
    .string()
    .optional()
    .describe("PositionV2 account the Strategy managed at the end of this tick"),
  outsideStreak: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Consecutive ticks the active bin has been outside the position range"),
  recentersToday: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Recenters already counted on this UTC day"),
  recenterDay: z
    .number()
    .int()
    .optional()
    .describe("UTC day index, floor(instant / 86_400_000), the recenter budget belongs to"),
  lastRecenterAt: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("UTC millisecond of the last executed recenter, or null when none has"),
  lastRecenterIntents: z
    .array(z.string())
    .optional()
    .describe("Intent ids of the last recenter that completed, kept on later ticks"),
};
