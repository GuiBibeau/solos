// @ts-check
import { Effect, Option } from "effect";
import { MintDecimalsUnverified } from "../domain/errors.js";
import { MintDecimals } from "../ports/mint-decimals.js";

/**
 * Before a new hold: when a decimals reader is installed, an unverified mint fails the
 * reserve and stores nothing. Liquidity ticks name the pool's token A mint, or wrapped SOL
 * when the tick did not observe one. A missing reader leaves scripted ledgers unchanged.
 * @param {string} mint
 */
export const guardMintDecimals = (mint) =>
  Effect.gen(function* () {
    const reader = yield* Effect.serviceOption(MintDecimals);
    if (Option.isNone(reader)) return;
    const decimals = yield* reader.value.decimalsOf(mint);
    if (decimals !== undefined) return;
    return yield* new MintDecimalsUnverified({ mint });
  });
