// @ts-check
/**
 * The pure withdraw quote for one `remove_liquidity` action: the requested bps fraction of
 * the position's current liquidity, removed whole units, with the minimum receipts the
 * pinned protocol math computes at the current price and the requested slippage tolerance.
 * Same zero-dependency WASM the reads and deposits use; all BigInt end to end.
 */
import { decreaseLiquidityQuote } from "@orca-so/whirlpools-core";

/** @typedef {{ readonly sqrtPrice: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number; readonly currentLiquidity: bigint; readonly bps: number; readonly maxSlippageBps: number }} WithdrawIntent */

/** Quoted: the liquidity to remove and both receipt bounds. @typedef {{ readonly status: "quoted"; readonly liquidity: bigint; readonly estA: bigint; readonly estB: bigint; readonly minA: bigint; readonly minB: bigint }} WithdrawQuoted */

/** The fraction computes to zero liquidity: nothing to remove. @typedef {{ readonly status: "zero" }} WithdrawZero */

/** A quoted side would be paid under a zero minimum at this slippage. @typedef {{ readonly status: "quoted-zero-min"; readonly reason: string }} WithdrawZeroMin */

/** The pinned math refused the input outright; never a fabricated quote. @typedef {{ readonly status: "invalid"; readonly reason: string }} WithdrawInvalid */

/** @typedef {WithdrawQuoted | WithdrawZero | WithdrawZeroMin | WithdrawInvalid} WithdrawQuote */

/**
 * The bps fraction of the current liquidity, floored to whole units: removing 9999 bps of
 * one million removes 999_900, and any fraction smaller than one unit is a zero removal.
 * @param {bigint} currentLiquidity @param {number} bps
 * @returns {bigint}
 */
const liquidityForBps = (currentLiquidity, bps) => (currentLiquidity * BigInt(bps)) / 10_000n;

/**
 * Quote one removal. Never throws and never fabricates amounts; a removal the protocol
 * could not honor meaningfully is a typed reject the plan turns into `BuildRejected`.
 * @param {WithdrawIntent} input
 * @returns {WithdrawQuote}
 */
export const withdrawQuoteForBps = ({
  sqrtPrice,
  tickLowerIndex,
  tickUpperIndex,
  currentLiquidity,
  bps,
  maxSlippageBps,
}) => {
  const liquidity = liquidityForBps(currentLiquidity, bps);
  if (liquidity === 0n) return { status: "zero" };
  try {
    const quote = decreaseLiquidityQuote(
      liquidity,
      maxSlippageBps,
      sqrtPrice,
      tickLowerIndex,
      tickUpperIndex,
    );
    const estA = quote.tokenEstA;
    const estB = quote.tokenEstB;
    const minA = quote.tokenMinA;
    const minB = quote.tokenMinB;
    // The ADR's rounding rule: a side the position quotes at a nonzero amount may not round
    // down to a zero minimum — at that slippage the bound would permit receiving nothing
    // while the transaction still "succeeds".
    if ((minA === 0n && estA > 0n) || (minB === 0n && estB > 0n)) {
      return {
        status: "quoted-zero-min",
        reason:
          "the requested slippage tolerance rounds a nonzero quoted receipt to a zero minimum; " +
          "tighten maxSlippageBps",
      };
    }
    return { status: "quoted", liquidity, estA, estB, minA, minB };
  } catch (/** @type {unknown} */ error) {
    return {
      status: "invalid",
      reason: `the pinned quote math rejected this removal for this position range: ${
        error instanceof Error ? error.message : "unknown quote failure"
      }`,
    };
  }
};
