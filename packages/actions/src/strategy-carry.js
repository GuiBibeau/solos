// @ts-check
import { z } from "zod";
import { AddressSchema, DecimalSchema } from "./primitives.js";
import { USDC_MINT } from "./strategy-rebalance.js";
import { SlippageBpsSchema } from "./trading-primitives.js";

const MARKET = /^[A-Z][A-Z0-9]{1,15}(?:-PERP)?$/;

/** @param {string} value */
const fractionWidth = (value) => {
  const body = value.startsWith("-") ? value.slice(1) : value;
  const dot = body.indexOf(".");
  return dot === -1 ? 0 : body.length - dot - 1;
};

/**
 * Signed decimal scaled to `width` fractional digits.
 * @param {string} value
 * @param {number} width
 */
const scaledUnits = (value, width) => {
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const [whole, frac = ""] = body.split(".", 2);
  const units = BigInt(`${whole || "0"}${frac.padEnd(width, "0")}`);
  return negative ? -units : units;
};

/** Exact signed compare. Positive when `left` is greater. @param {string} left @param {string} right */
const compareDecimal = (left, right) => {
  const width = Math.max(fractionWidth(left), fractionWidth(right));
  const delta = scaledUnits(left, width) - scaledUnits(right, width);
  if (delta === 0n) return 0;
  return delta > 0n ? 1 : -1;
};

/**
 * @param {{
 *   exitHurdleAprPct: string;
 *   entryHurdleAprPct: string;
 *   notionalUsd: string;
 *   roundTripCostPct: string;
 * }} value
 * @param {{ addIssue: (issue: { code: "custom"; message: string; path: string[] }) => void }} ctx
 */
const refineHurdles = (value, ctx) => {
  if (compareDecimal(value.exitHurdleAprPct, value.entryHurdleAprPct) >= 0) {
    ctx.addIssue({
      code: "custom",
      message: "exitHurdleAprPct must be strictly less than entryHurdleAprPct",
      path: ["exitHurdleAprPct"],
    });
  }
  if (compareDecimal(value.notionalUsd, "0") <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "notionalUsd must be positive",
      path: ["notionalUsd"],
    });
  }
  if (compareDecimal(value.roundTripCostPct, "0") < 0) {
    ctx.addIssue({
      code: "custom",
      message: "roundTripCostPct must be non-negative",
      path: ["roundTripCostPct"],
    });
  }
};

/** Funding-carry parameters: one Phoenix short against a spot long of the same notional. */
export const CarryParamsSchema = z
  .object({
    market: z.string().regex(MARKET).describe("Perpetual market symbol such as SOL-PERP"),
    spotMint: AddressSchema.describe("Spot mint held long against the perp short"),
    quoteMint: AddressSchema.default(USDC_MINT).describe(
      "Quote mint used to fund and unwind the spot leg, default USDC",
    ),
    notionalUsd: DecimalSchema.describe("Target USD notional per leg"),
    entryHurdleAprPct: DecimalSchema.describe(
      "Minimum trailing mean funding APR in percent required to enter",
    ),
    exitHurdleAprPct: DecimalSchema.describe(
      "Trailing mean funding APR in percent below which an open carry exits",
    ),
    lookbackHours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .describe("Trailing mean funding window in hours (1 to 168)"),
    expectedHoldHours: z
      .number()
      .int()
      .min(1)
      .describe("Expected holding period in hours used to amortise roundTripCostPct"),
    roundTripCostPct: DecimalSchema.default("0.3").describe(
      "Estimated round-trip fee and slippage cost in percent, default 0.3",
    ),
    maxSlippageBps: SlippageBpsSchema.default(50).describe(
      "Maximum slippage in bps (0 to 9999, default 50) on both legs",
    ),
    maxLeverage: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(1)
      .describe("Maximum leverage on the perp short leg (1 to 100, default 1)"),
  })
  .superRefine(refineHurdles)
  .describe("Parameters for a carry Strategy");

/** @typedef {z.infer<typeof CarryParamsSchema>} CarryParams */

/**
 * A carry ticks on a clock. A non-empty allowlist must name the spot mint and the quote.
 * @param {{
 *   kind: string;
 *   tickSource: { type: string };
 *   bounds: { allowedMints: readonly string[] };
 *   params: unknown;
 * }} draft
 * @param {{ addIssue: (issue: { code: "custom"; message: string; path?: string[] }) => void }} ctx
 */
export const refineCarryDraft = (draft, ctx) => {
  if (draft.kind !== "carry") return;
  if (draft.tickSource.type !== "clock") {
    ctx.addIssue({
      code: "custom",
      message: "carry requires a clock tick source",
      path: ["tickSource"],
    });
  }
  const params = mintParams(draft.params);
  const allowed = draft.bounds.allowedMints;
  if (params === undefined || allowed.length === 0) return;
  for (const mint of [params.spotMint, params.quoteMint]) {
    if (mint.length === 0 || allowed.includes(mint)) continue;
    ctx.addIssue({
      code: "custom",
      message: `mint ${mint} must be in bounds.allowedMints`,
      path: ["bounds", "allowedMints"],
    });
  }
};

/** @param {unknown} params */
const mintParams = (params) => {
  if (typeof params !== "object" || params === null) return undefined;
  const row = /** @type {{ spotMint?: unknown; quoteMint?: unknown }} */ (params);
  const spotMint = typeof row.spotMint === "string" ? row.spotMint : "";
  const quoteMint = typeof row.quoteMint === "string" ? row.quoteMint : USDC_MINT;
  return { spotMint, quoteMint };
};
