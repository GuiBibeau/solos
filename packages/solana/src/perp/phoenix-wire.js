// @ts-check
import { z } from "zod";

/**
 * Documented wire contracts of the pinned Rise revision (see phoenix-api.js), parsed in strip
 * mode so provider extensions never break us. Only the fields the position contract reads are
 * listed; nothing else escapes the adapter.
 *
 * Units at that revision: `basePositionLots` is a signed integer string of base lots;
 * `collateral` is a quote-lot balance with 1 quote lot = 1e-6 USDC; lot and tick sizes live in
 * the market config (`baseLotsDecimals`), never in the trader-state response.
 */

/** Market metadata. `baseLotsDecimals` is optional here and its presence is validated by the mapper, which reports a missing lot size as incomplete state rather than a broken envelope. It may be negative: a lot larger than one token (PUMP at -2 trades 100 tokens per lot). */
export const MarketConfigSchema = z.object({
  symbol: z.string().min(1),
  baseLotsDecimals: z.number().int().optional(),
});

export const MarketsListSchema = z.array(MarketConfigSchema);

/** One open or residual position row. The deprecated per-row trigger arrays are ignored. */
export const PositionRowSchema = z.object({
  symbol: z.string().min(1),
  basePositionLots: z.string(),
});

export const SubaccountSchema = z.object({
  subaccountIndex: z.number().int(),
  collateral: z.string(),
  spotCollaterals: z.array(z.unknown()).optional(),
  positions: z.array(PositionRowSchema).default([]),
});

export const TraderStateSchema = z.object({
  authority: z.string().min(1),
  traderPdaIndex: z.number().int(),
  snapshot: z.object({
    subaccounts: z.array(SubaccountSchema),
  }),
});

/** @typedef {z.infer<typeof MarketConfigSchema>} MarketConfigWire */
/** @typedef {z.infer<typeof PositionRowSchema>} PositionRowWire */
/** @typedef {z.infer<typeof SubaccountSchema>} SubaccountWire */
/** @typedef {z.infer<typeof TraderStateSchema>} TraderStateWire */

/** @param {string} body @returns {unknown} */
export const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};
