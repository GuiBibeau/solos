// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema, DecimalSchema, TimestampSchema } from "./primitives.js";

export const PositionSchema = z.object({
  kind: z.enum(["token", "perp", "lend"]),
  /** Mint for token and lend positions, market symbol for perps. */
  instrument: z.string().min(1),
  amount: AmountSchema,
  decimals: z.number().int().min(0).max(18),
  valueUsd: DecimalSchema.nullable().describe("null when no price is available"),
  protocol: z.string().nullable(),
});

/** What the agent reads before deciding. Works for a plain wallet or a vault. */
export const PortfolioStateSchema = z.object({
  owner: AddressSchema,
  valuationUsd: DecimalSchema.nullable(),
  cash: z.array(PositionSchema).describe("Stablecoins and SOL"),
  positions: z.array(PositionSchema),
  at: TimestampSchema,
});

/** @typedef {z.infer<typeof PositionSchema>} Position */
/** @typedef {z.infer<typeof PortfolioStateSchema>} PortfolioState */
