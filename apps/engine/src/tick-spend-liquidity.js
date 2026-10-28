// @ts-check
import { PriceUnavailable } from "@solos/core";
import { actualUsdFor, reserveUsdFor, usdForLamports } from "@solos/core/strategy";
import { swapFeeReserveLamports } from "@solos/solana/swap/fee-reserve";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";

/**
 * @param {{
 *   readonly feed: {
 *     getPrice: (
 *       mint: string,
 *     ) => import("effect").Effect.Effect<{ priceUsd: string; source: string }, unknown>;
 *   };
 *   readonly decimals: {
 *     decimalsOf: (mint: string) => import("effect").Effect.Effect<number | undefined>;
 *   };
 * }} deps
 * @param {import("@solos-sh/actions").Action} action
 * @param {import("@solos/core/strategy").SpendContext | undefined} context
 */
export const quoteLiquidity = (deps, action, context) =>
  Effect.gen(function* () {
    const sol = yield* deps.feed.getPrice(WSOL_MINT);
    if (!isPositive(sol.priceUsd)) return yield* missingPrice(sol.source);
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), sol.priceUsd);
    if (feeUsd === undefined) return yield* missingPrice(sol.source);
    const mint = context?.mint ?? WSOL_MINT;
    const decimals = yield* deps.decimals.decimalsOf(mint);
    if (decimals === undefined) return unverified(mint);
    const priced = liquidityPriced(context, decimals, feeUsd);
    return {
      reserveUsd: reserveUsdFor(action, priced),
      actualUsd: actualUsdFor(action, priced),
      mint,
      solPriceUsd: sol.priceUsd,
    };
  });

/**
 * @param {import("@solos/core/strategy").SpendContext | undefined} context
 * @param {number} decimals
 * @param {string} feeUsd
 */
const liquidityPriced = (context, decimals, feeUsd) => {
  const row = context ?? {};
  return {
    priceUsd: row.priceA ?? "0",
    decimals: row.decimalsA ?? decimals,
    feeUsd,
    valueUsd: row.valueUsd,
    redeposit: row.redeposit,
    priceB: row.priceB,
    decimalsB: row.decimalsB,
  };
};

/** @param {string} mint */
const unverified = (mint) => ({
  reserveUsd: "0",
  actualUsd: "0",
  mint,
  unverified: /** @type {const} */ (true),
});

/** @param {string} priceUsd */
const isPositive = (priceUsd) => /^\d+(\.\d+)?$/u.test(priceUsd) && /[1-9]/u.test(priceUsd);

/** @param {string} source */
const missingPrice = (source) =>
  Effect.fail(
    new PriceUnavailable({
      mint: WSOL_MINT,
      source,
      reason: "price must be positive before a Strategy cap reserves",
    }),
  );
