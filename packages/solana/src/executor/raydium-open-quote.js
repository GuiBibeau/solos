// @ts-check
/**
 * The pure half of an open, and what the caller records for it.
 *
 * Everything here is decided before a key is generated or an account is read: the range must
 * align to the pool, it must be one the instruction can address, and the budgets must buy some
 * liquidity at the current price. A refusal costs nothing.
 */
import { needsBitmapExtension } from "../liquidity/raydium-clmm-accounts.js";
import { depositLiquidityForBudgets, spendBound } from "../liquidity/whirlpool-deposit-quote.js";

/** The two funding sides of an open, in instruction order. @param {any} accounts @param {any} quote */
export const openSides = (accounts, quote) => [
  { mint: accounts.vault0Mint, ata: accounts.tokenAccount0, required: quote.requiredA },
  { mint: accounts.vault1Mint, ata: accounts.tokenAccount1, required: quote.requiredB },
];

/**
 * The pure half of an open: align the range to the pool, refuse a range the instruction cannot
 * address yet, and fit the budgets. All of it is decided before a key is generated.
 * @param {any} action @param {any} pool
 */
export const openQuote = (action, pool) => {
  const { tickSpacing } = pool;
  // Refused, never rounded: rounding a range is choosing one, which is the caller's job.
  if (action.tickLower % tickSpacing !== 0 || action.tickUpper % tickSpacing !== 0) {
    return {
      ok: /** @type {const} */ (false),
      reason: `tick range ${action.tickLower}..${action.tickUpper} is not aligned to the pool's tick spacing of ${tickSpacing}`,
    };
  }
  const ticks = { tickLower: action.tickLower, tickUpper: action.tickUpper, tickSpacing };
  if (needsBitmapExtension(ticks)) {
    return {
      ok: /** @type {const} */ (false),
      reason:
        "this range needs the pool's tick-array bitmap extension, which opening does not pass",
    };
  }
  const quote = depositLiquidityForBudgets({
    sqrtPrice: pool.sqrtPrice,
    tickLowerIndex: action.tickLower,
    tickUpperIndex: action.tickUpper,
    amountA: BigInt(action.amountA),
    amountB: BigInt(action.amountB),
  });
  if (quote.status === "quoted") {
    return {
      ok: /** @type {const} */ (true),
      liquidity: quote.liquidity,
      requiredA: quote.requiredA,
      requiredB: quote.requiredB,
    };
  }
  return {
    ok: /** @type {const} */ (false),
    reason:
      quote.status === "zero"
        ? "the budgets buy no liquidity at this price for this range"
        : quote.reason,
  };
};

/**
 * What the caller records for an open (ADR-0022): the range and the bounds actually encoded. No
 * NFT mint — that key is per build, so the one a simulation shows is not the one execute signs.
 * @param {any} action
 * @param {{ readonly liquidity: bigint; readonly requiredA: bigint; readonly requiredB: bigint }} plan
 */
export const openQuoteOf = (action, plan) => ({
  kind: /** @type {const} */ ("position_open"),
  pool: action.pool,
  tickLower: action.tickLower,
  tickUpper: action.tickUpper,
  liquidity: String(plan.liquidity),
  requiredA: String(plan.requiredA),
  requiredB: String(plan.requiredB),
  tokenMaxA: String(spendBound(plan.requiredA, BigInt(action.amountA), action.maxSlippageBps)),
  tokenMaxB: String(spendBound(plan.requiredB, BigInt(action.amountB), action.maxSlippageBps)),
});
