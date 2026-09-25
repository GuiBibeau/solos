// @ts-check
/**
 * `buy_exact_quote_in_v2` instruction data, encoded to the pinned IDL.
 *
 * Args are `spendable_quote_in: u64` and `min_tokens_out: u64` — an exact input budget with a
 * minimum the program enforces, which is exactly what the contract asks for. The v2 form takes
 * no `track_volume`, unlike the 16-account variants.
 *
 * The 16-account `buy_exact_sol_in` was tried first and the deployed program refused it with
 * `BuybackFeeRecipientMissing`, so that discriminator is deliberately not here.
 *
 * The discriminator below is the IDL's own eight bytes. Pinning it in a test turns a silent
 * upstream change into a failing suite rather than a failing wallet: this instruction is not
 * covered by the published docs, so the IDL is the whole contract.
 */
import { getU64Encoder } from "@solana/kit";

const u64 = getU64Encoder();

/** 8-byte Anchor discriminator of `buy_exact_quote_in_v2`, from the IDL at the pinned commit. */
export const BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR = Object.freeze([
  194, 171, 28, 70, 104, 77, 91, 47,
]);

/**
 * @param {{ spendableQuoteIn: bigint; minTokensOut: bigint }} args
 * @returns {Uint8Array}
 */
export const encodeBuyExactQuoteInV2 = ({ spendableQuoteIn, minTokensOut }) =>
  Uint8Array.from([
    ...BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR,
    ...u64.encode(spendableQuoteIn),
    ...u64.encode(minTokensOut),
  ]);

/** 8-byte Anchor discriminator of `sell_v2`, from the IDL at the pinned commit. */
export const SELL_V2_DISCRIMINATOR = Object.freeze([93, 246, 130, 60, 231, 233, 64, 178]);

/**
 * `sell_v2(amount, min_sol_output)`: an exact quantity of the coin in, and the least SOL the
 * program may return. Same two-u64 shape as the buy, opposite direction.
 * @param {{ tokensIn: bigint; minSolOutput: bigint }} args
 * @returns {Uint8Array}
 */
export const encodeSellV2 = ({ tokensIn, minSolOutput }) =>
  Uint8Array.from([...SELL_V2_DISCRIMINATOR, ...u64.encode(tokensIn), ...u64.encode(minSolOutput)]);
