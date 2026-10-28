// @ts-check
import { ClosePerpActionSchema, OpenPerpActionSchema } from "@solos-sh/actions";
import { baseUnitsForUsd, compareSigned, scaleBps, usdMicro } from "./carry-decimal.js";

const ONBOARD = {
  reason: "trader is not onboarded",
  remedy: "onboard the Phoenix trader and wait until onboarding status is ready",
};
const COLLATERAL = {
  reason: "trader collateral is insufficient",
  remedy: "deposit Phoenix collateral before the carry can open the short",
};
const QUOTE = {
  reason: "quote balance is insufficient",
  remedy: "fund the quote mint before the carry can buy the spot leg",
};
const PRICE = {
  reason: "mark or mint price is missing",
  remedy: "wait for a positive USD price for the spot mint and the quote mint",
};
const DUST = {
  reason: "leg size rounds to zero",
  remedy: "raise notionalUsd so both legs clear one base unit",
};

/**
 * @typedef {{ readonly spot: string; readonly micro: string; readonly quoteAmount: string }} Sized
 * @typedef {{ readonly reason: string; readonly remedy: string }} CarryFailure
 */

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {import("./carry-view.js").CarryView} view
 * @returns {{ failure: CarryFailure } | { sized: Sized }}
 */
export const sizeEntry = (params, view) => {
  if (view.mark === undefined || view.spotPrice === undefined || view.quotePrice === undefined) {
    return { failure: PRICE };
  }
  return sizedLegs(params, view);
};

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {import("./carry-view.js").CarryView} view
 * @returns {{ failure: CarryFailure } | { sized: Sized }}
 */
const sizedLegs = (params, view) => {
  const spotPrice = view.spotPrice ?? "0";
  const quotePrice = view.quotePrice ?? "0";
  const micro = usdMicro(params.notionalUsd);
  const quoteAmount = baseUnitsForUsd(params.notionalUsd, quotePrice, view.quoteDecimals);
  const spot = baseUnitsForUsd(params.notionalUsd, spotPrice, view.spotDecimals);
  if (isDust(micro, quoteAmount, spot)) return { failure: DUST };
  return { sized: { spot: spot ?? "0", micro, quoteAmount: quoteAmount ?? "0" } };
};

/**
 * @param {string} micro
 * @param {string | undefined} quoteAmount
 * @param {string | undefined} spot
 */
const isDust = (micro, quoteAmount, spot) =>
  micro === "0" ||
  quoteAmount === undefined ||
  quoteAmount === "0" ||
  spot === undefined ||
  spot === "0";

/**
 * @param {import("./carry-view.js").CarryView} view
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {Sized} sized
 * @returns {CarryFailure | undefined}
 */
export const entryFundingBlock = (view, params, sized) => {
  const collateral = view.freeCollateral ?? view.equity;
  const required = requiredCollateral(params);
  if (collateral === undefined || compareSigned(collateral, required) < 0) return COLLATERAL;
  if (BigInt(view.quoteBalance) < BigInt(sized.quoteAmount)) return QUOTE;
  return undefined;
};

/** @param {import("@solos-sh/actions").CarryParams} params */
const requiredCollateral = (params) => {
  const units = usdMicro(params.notionalUsd);
  const leverage = BigInt(params.maxLeverage);
  const micro = (BigInt(units) + leverage - 1n) / leverage;
  const digits = micro.toString().padStart(7, "0");
  const frac = digits.slice(-6).replace(/0+$/, "");
  const whole = digits.slice(0, -6);
  return frac === "" ? whole : `${whole}.${frac}`;
};

export const onboardFailure = () => ONBOARD;

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {string} mark
 * @param {Sized} sized
 */
export const enterActions = (params, mark, sized) => [
  OpenPerpActionSchema.parse({
    type: "open_perp",
    protocol: "phoenix",
    market: params.market,
    side: "short",
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    notionalUsd: sized.micro,
    maxLeverage: params.maxLeverage,
    limitPriceUsd: scaleBps(mark, 10_000 - params.maxSlippageBps),
  }),
  swap({
    inputMint: params.quoteMint,
    outputMint: params.spotMint,
    amount: sized.quoteAmount,
    maxSlippageBps: params.maxSlippageBps,
  }),
];

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {string} mark
 * @param {string} spotAmount
 */
export const exitActions = (params, mark, spotAmount) => [
  ClosePerpActionSchema.parse({
    type: "close_perp",
    protocol: "phoenix",
    market: params.market,
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    limitPriceUsd: scaleBps(mark, 10_000 + params.maxSlippageBps),
  }),
  swap({
    inputMint: params.spotMint,
    outputMint: params.quoteMint,
    amount: spotAmount,
    maxSlippageBps: params.maxSlippageBps,
  }),
];

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {string} mark
 */
export const unwindAction = (params, mark) =>
  ClosePerpActionSchema.parse({
    type: "close_perp",
    protocol: "phoenix",
    market: params.market,
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    limitPriceUsd: scaleBps(mark, 10_000 + params.maxSlippageBps),
  });

/**
 * @param {{ inputMint: string; outputMint: string; amount: string; maxSlippageBps: number }} leg
 */
const swap = (leg) => ({
  type: /** @type {const} */ ("swap"),
  inputMint: leg.inputMint,
  outputMint: leg.outputMint,
  amount: leg.amount,
  maxSlippageBps: leg.maxSlippageBps,
});

/**
 * Spend context so the perp leg is judged against the quote mint.
 * @param {import("@solos-sh/actions").Action} action
 * @param {Readonly<Record<string, string | number>>} observations
 */
export const carrySpendContext = (action, observations) => {
  if (action.type !== "open_perp" && action.type !== "close_perp") return undefined;
  const mint = observations.quoteMint;
  if (typeof mint !== "string" || mint.length === 0) return undefined;
  return { mint };
};
