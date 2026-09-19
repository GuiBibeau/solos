// @ts-check
/**
 * Underlying principal amounts for one Whirlpool position, via the pinned protocol math
 * (`@orca-so/whirlpools-core`, zero-dependency WASM). Three cases over the pool's current
 * Q64.64 sqrt price, all BigInt end to end, floor rounding (`round_up: false`) on both
 * sides — exactly what `decreaseLiquidityQuote(liquidity, 0, …)` returns as token estimates,
 * which the unit tests cross-check. Output amounts are decimal strings: JSON has no bigint
 * and no JS Number ever touches base units. Zero liquidity reads "0"/"0" without calling
 * the math at all, so an owned empty position is a successful zero read.
 */
import {
  positionStatus,
  tickIndexToSqrtPrice,
  tryGetAmountDeltaA,
  tryGetAmountDeltaB,
} from "@orca-so/whirlpools-core";

/** Decimal-string base-unit amounts of token A and token B. @typedef {{ readonly amountA: string; readonly amountB: string }} UnderlyingAmounts */

/** Inputs, all from guarded decodes: the pool's current sqrt price and the position's range. @typedef {{ readonly sqrtPrice: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number; readonly liquidity: bigint }} UnderlyingInput */

/**
 * @param {UnderlyingInput} input
 * @returns {UnderlyingAmounts}
 */
export const underlyingAmounts = ({ sqrtPrice, tickLowerIndex, tickUpperIndex, liquidity }) => {
  if (liquidity === 0n) return { amountA: "0", amountB: "0" };
  const lower = tickIndexToSqrtPrice(tickLowerIndex);
  const upper = tickIndexToSqrtPrice(tickUpperIndex);
  const status = positionStatus(sqrtPrice, tickLowerIndex, tickUpperIndex);
  if (status === "priceBelowRange") {
    return {
      amountA: tryGetAmountDeltaA(lower, upper, liquidity, false).toString(),
      amountB: "0",
    };
  }
  if (status === "priceAboveRange") {
    return {
      amountA: "0",
      amountB: tryGetAmountDeltaB(lower, upper, liquidity, false).toString(),
    };
  }
  return {
    // priceInRange: the decode guards exclude the "invalid" status (lower >= upper never
    // decodes), so the remaining protocol state is an in-range position.
    amountA: tryGetAmountDeltaA(sqrtPrice, upper, liquidity, false).toString(),
    amountB: tryGetAmountDeltaB(sqrtPrice, lower, liquidity, false).toString(),
  };
};
