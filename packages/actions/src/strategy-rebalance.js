// @ts-check
import { z } from "zod";
import { AddressSchema, DecimalSchema } from "./primitives.js";
import { SlippageBpsSchema } from "./trading-primitives.js";

/** USDC mint. The default quote every rebalance swap routes through. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SUM_DIGITS = 6;

/** @param {string} value */
const isPositiveDecimal = (value) => !value.startsWith("-") && /[1-9]/.test(value);

/** A weight in (0, 1): positive, and the integer part is only zeros. @param {string} value */
const inOpenUnit = (value) => {
  if (!isPositiveDecimal(value)) return false;
  const whole = value.split(".", 1)[0] ?? "0";
  return /^0+$/.test(whole);
};

/** @param {string} value */
const fractionLength = (value) => {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
};

/**
 * Scale a decimal to `width` fractional digits. A leading minus is a negative unit.
 * @param {string} value
 * @param {number} width
 */
const toUnits = (value, width) => {
  const negative = value.startsWith("-");
  const text = negative ? value.slice(1) : value;
  const [whole, frac = ""] = text.split(".", 2);
  const units = BigInt(`${whole || "0"}${frac.padEnd(width, "0")}`);
  return negative ? -units : units;
};

/** True when the weights sum to 1 within 1e-6. @param {Readonly<Record<string, string>>} targets */
const weightsSumToOne = (targets) => {
  const values = Object.values(targets);
  const width = Math.max(SUM_DIGITS, ...values.map((value) => fractionLength(value)));
  let total = 0n;
  for (const value of values) total += toUnits(value, width);
  const one = 10n ** BigInt(width);
  const delta = total >= one ? total - one : one - total;
  return delta <= 10n ** BigInt(width - SUM_DIGITS);
};

/**
 * @param {{ targets: Readonly<Record<string, string>>; quoteMint: string }} value
 * @param {{ addIssue: (issue: { code: "custom"; message: string; path: string[] }) => void }} ctx
 */
const refineWeights = (value, ctx) => {
  const entries = Object.entries(value.targets);
  if (entries.length < 2) {
    ctx.addIssue({ code: "custom", message: "at least two target mints", path: ["targets"] });
  }
  for (const [mint, weight] of entries) {
    if (!inOpenUnit(weight)) {
      ctx.addIssue({
        code: "custom",
        message: "every weight must be a positive decimal in (0, 1)",
        path: ["targets", mint],
      });
    }
  }
  if (!weightsSumToOne(value.targets)) {
    ctx.addIssue({ code: "custom", message: "weights must sum to 1", path: ["targets"] });
  }
  const quoteWeight = value.targets[value.quoteMint];
  if (quoteWeight !== undefined && !inOpenUnit(quoteWeight)) {
    ctx.addIssue({
      code: "custom",
      message: "quote mint repeated as a target needs a positive weight in (0, 1)",
      path: ["quoteMint"],
    });
  }
};

/** Target weights, the band, and the quote mint a rebalance tick trades through. */
export const RebalanceParamsSchema = z
  .object({
    targets: z
      .record(AddressSchema, DecimalSchema)
      .describe(
        "Target weight per mint. At least two mints. Each weight is a positive decimal in (0, 1) and the weights sum to 1 within 1e-6. Native SOL is wrapped SOL So11111111111111111111111111111111111111112",
      ),
    bandBps: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .describe("Drift in basis points beyond which a tick rebalances (1..5000)"),
    quoteMint: AddressSchema.default(USDC_MINT).describe(
      "Mint every rebalance swap routes through (default USDC)",
    ),
    minTradeUsd: DecimalSchema.refine(
      isPositiveDecimal,
      "minTradeUsd must be greater than 0",
    ).describe("Minimum USD notional for a rebalance leg; smaller legs are skipped"),
    maxSlippageBps: SlippageBpsSchema.default(50).describe(
      "Maximum slippage in basis points for emitted swap Actions (default 50)",
    ),
  })
  .superRefine(refineWeights)
  .describe("Parameters for a rebalance Strategy");

/** @typedef {z.infer<typeof RebalanceParamsSchema>} RebalanceParams */
