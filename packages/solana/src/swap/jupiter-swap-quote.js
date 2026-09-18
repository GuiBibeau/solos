// @ts-check
import { z } from "zod";

/**
 * Normalization of the Jupiter Swap V2 quote-only response (`GET /swap/v2/order`, no `taker`)
 * onto the slice's `SwapQuote`.
 *
 * Units: `inAmount`, `outAmount`, and `otherAmountThreshold` are exact decimal strings in base
 * units and travel verbatim — never through a JS Number; consistency bounds are checked with
 * BigInt (see jupiter-swap-validate.js). `priceImpact` is a JSON number in percentage points;
 * `priceImpactPct` keeps the slice's legacy decimal-ratio convention by dividing by 100
 * (1 percentage point => "0.01"), shortest-round-trip Number math on a ratio, never on a
 * base-unit amount — same documented rationale as the Jupiter price adapter. V2 has no
 * `routeSummary` object; hop labels are `routePlan[].swapInfo.label`.
 *
 * Freshness: V2 documents no quote TTL, so `expiresAt` is the local receipt time plus a
 * 30-second local TTL — when solOS stops presenting the quote as usable, not a price guarantee.
 */

/** Local quote lifetime; deliberately short because quotes go stale well under a minute. */
export const QUOTE_TTL_MS = 30_000;

export const PROVIDER = /** @type {const} */ ("jupiter");

/** Non-negative base-unit amount strings; minimum outputs may legitimately be zero. */
export const BASE_UNITS = /^\d+$/;
/** Positive variant: quoted outputs and hop amounts must exceed zero. */
export const POSITIVE_BASE_UNITS = /^[1-9]\d*$/;

/** Documented routing step: the hop identity, its base-unit amounts, and its allocation. */
const RouteStepSchema = z.object({
  swapInfo: z
    .object({
      ammKey: z.string().min(1),
      label: z.string().min(1),
      inputMint: z.string().min(1),
      outputMint: z.string().min(1),
      inAmount: z.string(),
      outAmount: z.string(),
    })
    .strip(),
  percent: z.number().min(1).max(100),
  bps: z.number().int().min(1).max(10_000),
});

/** Documented 200 envelope, parsed in strip mode so provider extensions never break us. */
export const QuoteEnvelopeSchema = z.object({
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: z.string(),
  outAmount: z.string(),
  otherAmountThreshold: z.string().optional(),
  priceImpact: z.number().finite().optional(),
  swapMode: z.string(),
  slippageBps: z.number().int().min(0).max(10_000),
  router: z.string(),
  routePlan: z.array(RouteStepSchema.strip()),
  transaction: z.union([z.string(), z.null()]),
});

/** @typedef {z.infer<typeof QuoteEnvelopeSchema>} JupiterQuoteEnvelope */

/**
 * The validated envelope onto the slice's SwapQuote: amounts verbatim, the ratio normalized,
 * hop labels as the route summary, expiry stamped locally at receipt time.
 * @param {JupiterQuoteEnvelope} quote
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @returns {import("@solos/core").SwapQuote}
 */
export const toSwapQuote = (quote, request) => ({
  provider: PROVIDER,
  inputMint: request.inputMint,
  outputMint: request.outputMint,
  inAmount: quote.inAmount,
  outAmount: quote.outAmount,
  // Presence is guaranteed by envelopeRejection before this runs.
  minOutAmount: /** @type {string} */ (quote.otherAmountThreshold),
  priceImpactPct: String(/** @type {number} */ (quote.priceImpact) / 100),
  routeSummary: quote.routePlan.map((step) => step.swapInfo.label),
  expiresAt: Date.now() + QUOTE_TTL_MS,
  raw: quote,
});
