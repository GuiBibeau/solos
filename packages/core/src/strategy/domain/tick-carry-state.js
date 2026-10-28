// @ts-check
import { z } from "zod";

const sample = z.object({
  at: z.number().int().describe("Unix millisecond of one funding print"),
  aprPct: z.string().describe("Annualized funding percent at that print"),
});

/** Kind state a carry tick records. Spread into `TickSchema.shape.state`. */
export const carryTickFields = {
  market: z.string().optional().describe("Perp market this carry watches"),
  side: z.enum(["long", "short", "flat"]).optional().describe("Perp side recorded by this tick"),
  spotAmount: z
    .string()
    .optional()
    .describe("Spot base units entered, or zero when the spot leg is absent"),
  perpNotionalUsd: z.string().optional().describe("Perp notional in 1e6 USD units from the open"),
  perpSize: z.string().optional().describe("Absolute perp base lots when observed"),
  entryAt: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Unix millisecond the carry entered, or null before entry"),
  entryFundingAprPct: z.string().optional().describe("Trailing mean APR at entry"),
  trailingMeanAprPct: z.string().optional().describe("Trailing mean funding APR this tick"),
  entryHurdleAprPct: z.string().optional().describe("Entry hurdle APR in percent"),
  exitHurdleAprPct: z.string().optional().describe("Exit hurdle APR in percent"),
  breakEvenAprPct: z.string().optional().describe("Fee-aware break-even APR in percent"),
  fundingSamples: z
    .array(sample)
    .optional()
    .describe("Funding prints kept inside the lookback window"),
  pauseAfter: z
    .boolean()
    .optional()
    .describe("True when this tick asks the Engine to pause after it completes"),
  pauseReason: z.string().optional().describe("Why the Strategy should pause"),
  naked: z.boolean().optional().describe("True when a perp short filled and the spot leg did not"),
};
