// @ts-check
import { compareDecimal, getPrice } from "@solos/core";
import { landedFeeLamports } from "@solos/solana";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";
import { lamportsToUsd } from "./sol-notional.js";

/**
 * USD value of the fee a landed transaction paid, priced like the hold. A missing fee or a
 * nonpositive SOL price is `undefined`, so the hold stays open instead of settling zero.
 * @param {string} signature
 */
export const paidFeeUsd = (signature) =>
  Effect.gen(function* () {
    const fee = yield* landedFeeLamports(signature);
    if (fee === undefined) return undefined;
    const price = yield* getPrice({ mint: WSOL_MINT });
    if (!isPositiveUsd(price.priceUsd)) return undefined;
    return lamportsToUsd(fee.toString(), price.priceUsd);
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

/** @param {string} priceUsd */
const isPositiveUsd = (priceUsd) =>
  /^\d+(\.\d+)?$/.test(priceUsd) && compareDecimal(priceUsd, "0") > 0;
