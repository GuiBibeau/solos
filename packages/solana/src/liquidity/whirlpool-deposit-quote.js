// @ts-check
/**
 * The liquidity a deposit may add to one existing Whirlpool position, computed from the two
 * maximum token budgets with the pinned protocol math (`@orca-so/whirlpools-core`, the same
 * zero-dependency WASM the reads use). The budgets are maxima, never targets: the selection
 * takes the smaller liquidity of the two single-budget quotes in range, and the one relevant
 * budget when the price sits outside the range (the other token is not needed at all). The
 * chosen liquidity then fixes the exact required spends, always at or under both budgets —
 * rounding down, never up. All BigInt end to end; no JS Number touches base units.
 */
import {
  increaseLiquidityQuote,
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  positionStatus,
} from "@orca-so/whirlpools-core";

/** @typedef {{ readonly sqrtPrice: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number; readonly amountA: bigint; readonly amountB: bigint }} DepositBudgets */

/** Quoted: the liquidity to add and the exact required spends, each within its budget. @typedef {{ readonly status: "quoted"; readonly liquidity: bigint; readonly requiredA: bigint; readonly requiredB: bigint }} DepositQuoted */

/** The budgets cannot buy any liquidity at all (zero, or a zero result after rounding). @typedef {{ readonly status: "zero" }} DepositZero */

/** The pinned math refused the input outright; never a fabricated quote. @typedef {{ readonly status: "invalid"; readonly reason: string }} DepositInvalid */

/** @typedef {DepositQuoted | DepositZero | DepositInvalid} DepositQuote */

/**
 * The largest liquidity both budgets can fund, with the spends the protocol will require at
 * the current price. A non-quoted result means the request cannot add anything and must be
 * rejected before any transaction is built.
 * @param {DepositBudgets} input
 * @returns {DepositQuote}
 */
export const depositLiquidityForBudgets = ({
  sqrtPrice,
  tickLowerIndex,
  tickUpperIndex,
  amountA,
  amountB,
}) => {
  try {
    const fromA = increaseLiquidityQuoteA(amountA, 0, sqrtPrice, tickLowerIndex, tickUpperIndex);
    const fromB = increaseLiquidityQuoteB(amountB, 0, sqrtPrice, tickLowerIndex, tickUpperIndex);
    const status = positionStatus(sqrtPrice, tickLowerIndex, tickUpperIndex);
    const liquidity = pickLiquidity(status, fromA.liquidityDelta, fromB.liquidityDelta);
    if (liquidity === 0n) return { status: "zero" };
    const spends = increaseLiquidityQuote(liquidity, 0, sqrtPrice, tickLowerIndex, tickUpperIndex);
    return {
      status: "quoted",
      liquidity,
      requiredA: spends.tokenEstA,
      requiredB: spends.tokenEstB,
    };
  } catch (/** @type {unknown} */ error) {
    return {
      status: "invalid",
      reason: `the pinned quote math rejected this deposit for this position range: ${
        error instanceof Error ? error.message : "unknown quote failure"
      }`,
    };
  }
};

/**
 * The one relevant budget when the price sits outside the range (the other token buys
 * nothing there, so its quote is always zero); the smaller of the two in range. BigInt
 * comparison, never Math.min — Numbers must not touch base units.
 * @param {string} status @param {bigint} fromA @param {bigint} fromB
 */
const pickLiquidity = (status, fromA, fromB) => {
  if (status === "priceBelowRange") return fromA;
  if (status === "priceAboveRange") return fromB;
  // eslint-disable-next-line unicorn/prefer-math-min-max -- Math.min coerces to Number
  return fromB < fromA ? fromB : fromA;
};

/**
 * The encoded on-chain spend bounds: the quoted required spend plus the requested slippage
 * tolerance (rounded up), capped by the absolute budget. A tighter tolerance therefore
 * produces tighter bounds, and the budgets are never exceeded whatever the tolerance.
 * @param {bigint} required @param {bigint} budget @param {number} slippageBps
 * @returns {bigint}
 */
export const spendBound = (required, budget, slippageBps) => {
  const tolerance = required * BigInt(10_000 + slippageBps);
  const withTolerance = (tolerance + 9999n) / 10_000n;
  // eslint-disable-next-line unicorn/prefer-math-min-max -- Math.min coerces to Number
  return withTolerance < budget ? withTolerance : budget;
};
