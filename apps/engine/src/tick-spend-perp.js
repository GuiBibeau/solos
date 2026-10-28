// @ts-check
import { PriceUnavailable, compareDecimal } from "@solos/core";
import { actualUsdFor, reserveUsdFor, usdForLamports } from "@solos/core/strategy";
import { swapFeeReserveLamports } from "@solos/solana/swap/fee-reserve";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";

/**
 * An open reserves the USD notional plus a SOL fee. A close reserves only the SOL fee.
 * The mint is the quote mint when the tick observed one, so the allowlist can name it.
 * @param {{
 *   readonly feed: {
 *     getPrice: (
 *       mint: string,
 *     ) => import("effect").Effect.Effect<{ priceUsd: string; source: string }, unknown>;
 *   };
 * }} deps
 * @param {import("@solos-sh/actions").Action} action
 * @param {import("@solos/core/strategy").SpendContext | undefined} context
 */
export const quotePerp = (deps, action, context) =>
  Effect.gen(function* () {
    const sol = yield* deps.feed.getPrice(WSOL_MINT);
    if (!isPositive(sol.priceUsd)) return yield* missingPrice(sol.source);
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), sol.priceUsd);
    if (feeUsd === undefined) return yield* missingPrice(sol.source);
    const priced = { priceUsd: "0", decimals: 0, feeUsd };
    return {
      reserveUsd: reserveUsdFor(action, priced),
      actualUsd: actualUsdFor(action, priced),
      mint: context?.mint ?? WSOL_MINT,
      solPriceUsd: sol.priceUsd,
    };
  });

/** @param {string} priceUsd */
const isPositive = (priceUsd) =>
  /^\d+(\.\d+)?$/u.test(priceUsd) && compareDecimal(priceUsd, "0") > 0;

/** @param {string} source */
const missingPrice = (source) =>
  Effect.fail(
    new PriceUnavailable({
      mint: WSOL_MINT,
      source,
      reason: "price must be positive before a Strategy cap reserves",
    }),
  );
