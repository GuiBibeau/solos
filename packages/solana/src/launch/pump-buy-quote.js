// @ts-check
/**
 * What a SOL budget buys on a pump.fun bonding curve, and the minimum the program must deliver.
 *
 * `buy_exact_sol_in(spendable_sol_in, min_tokens_out, track_volume)` spends at most the budget
 * and reverts unless the buyer receives at least the minimum. The minimum is therefore the whole
 * protection, and it is enforced on chain — this arithmetic only decides how tight it is.
 *
 * So every step rounds against the buyer. Fees are subtracted before the curve is applied, each
 * division floors, and slippage comes off the result. An estimate that is too low costs a looser
 * bound; one that is too high reverts the transaction. Neither silently overpays, and the
 * direction of every rounding choice here is the one that cannot.
 *
 * The curve is Uniswap V2 over the synthetic reserves the account carries, per the pinned
 * program documentation. Integers throughout: reserves are u64 and a float would lose the low
 * bits that decide whole tokens.
 */

/** Basis-point denominator, shared with the rest of the launch slice. */
export const BPS = 10_000n;

/**
 * The SOL that reaches the curve once the protocol and creator fees are taken. Pump charges the
 * fee on top of the traded amount, so the budget divides rather than subtracts.
 * @param {bigint} budgetLamports the caller's whole spendable budget, fees included
 * @param {bigint} totalFeeBps protocol plus creator fee
 */
export const solIntoCurve = (budgetLamports, totalFeeBps) =>
  (budgetLamports * BPS) / (BPS + totalFeeBps);

/**
 * Constant product over the synthetic reserves: the tokens the curve releases for `solIn`.
 * @param {{ virtualTokenReserves: bigint; virtualQuoteReserves: bigint }} curve
 * @param {bigint} solIn already net of fees
 */
export const tokensForSol = (curve, solIn) => {
  const denominator = curve.virtualQuoteReserves + solIn;
  if (denominator <= 0n || solIn <= 0n) return 0n;
  return (curve.virtualTokenReserves * solIn) / denominator;
};

/**
 * The enforceable floor handed to the program.
 * @param {bigint} expectedTokens
 * @param {number} slippageBps
 */
export const minTokensOut = (expectedTokens, slippageBps) =>
  (expectedTokens * (BPS - BigInt(slippageBps))) / BPS;

/**
 * Quote one buy against a decoded curve.
 *
 * `realTokenReserves` caps it: the curve cannot release more than it holds, and the program
 * rejects an amount above that reserve. Clamping here keeps a budget larger than the remaining
 * curve from producing a minimum the program can never satisfy.
 * @param {{
 *   virtualTokenReserves: bigint; virtualQuoteReserves: bigint; realTokenReserves: bigint;
 * }} curve
 * @param {{ budgetLamports: bigint; totalFeeBps: bigint; slippageBps: number }} intent
 */
export const quoteBuy = (curve, { budgetLamports, totalFeeBps, slippageBps }) => {
  const solIn = solIntoCurve(budgetLamports, totalFeeBps);
  const uncapped = tokensForSol(curve, solIn);
  // eslint-disable-next-line unicorn/prefer-math-min-max -- Math.min coerces BigInt to Number
  const expectedTokens = uncapped > curve.realTokenReserves ? curve.realTokenReserves : uncapped;
  return {
    solIntoCurve: solIn,
    expectedTokens,
    minTokensOut: minTokensOut(expectedTokens, slippageBps),
  };
};

/**
 * The SOL a curve releases for `tokensIn`, before fees. The same constant product as the buy,
 * read in the other direction.
 * @param {{ virtualTokenReserves: bigint; virtualQuoteReserves: bigint }} curve
 * @param {bigint} tokensIn
 */
export const solForTokens = (curve, tokensIn) => {
  const denominator = curve.virtualTokenReserves + tokensIn;
  if (denominator <= 0n || tokensIn <= 0n) return 0n;
  return (curve.virtualQuoteReserves * tokensIn) / denominator;
};

/**
 * Quote one sell against a decoded curve.
 *
 * Fees come off the proceeds rather than dividing them: a seller receives the curve's output
 * less the protocol and creator share. As on the buy, every step floors against the trader and
 * the minimum is what the program enforces — `min_sol_output` — so an estimate that is too high
 * reverts rather than filling badly.
 * @param {{ virtualTokenReserves: bigint; virtualQuoteReserves: bigint }} curve
 * @param {{ tokensIn: bigint; totalFeeBps: bigint; slippageBps: number }} intent
 */
export const quoteSell = (curve, { tokensIn, totalFeeBps, slippageBps }) => {
  const gross = solForTokens(curve, tokensIn);
  const afterFees = (gross * (BPS - totalFeeBps)) / BPS;
  return {
    grossSol: gross,
    expectedSol: afterFees,
    minSolOutput: (afterFees * (BPS - BigInt(slippageBps))) / BPS,
  };
};
