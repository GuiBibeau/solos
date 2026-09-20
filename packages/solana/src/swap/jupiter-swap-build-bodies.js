// @ts-check
import { getBase58Decoder, getBase64Codec, getU64Codec } from "@solana/kit";
import {
  ATA_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
} from "./jupiter-swap-build-validate.js";

/**
 * Canned Jupiter V2 `/swap/v2/build` bodies for the executor fixtures, encoded with the
 * programs' own instruction formats — never simplified stand-ins.
 *
 * Provenance. Endpoint contract: `GET {base}/swap/v2/build` (developers.jup.ag, Swap API V2
 * "Build swap transaction"), rechecked 2026-09-19. Instruction encodings: ComputeBudget
 * `setComputeUnitPrice` (discriminator 3 + u64 micro-lamports), ATA `createIdempotent` (data
 * byte 1), System `transfer` (discriminator 2 + u64 lamports), Token `closeAccount` (data byte
 * 9), and the Jupiter v6 anchor `route` instruction whose 8-byte discriminator is
 * `route_v2` instruction and whose args are the documented borsh
 * (inAmount, quotedOutAmount, slippageBps, platformFeeBps, positiveSlippageBps, routePlan).
 * The one-step fixture mirrors a current live route shape, and the embedded u64 amounts echo
 * the envelope
 * exactly: the executor decodes this layout, binds the input to the Action and the quoted
 * output to the envelope outAmount, and refuses anything it cannot decode this way.
 */

export const KEY = "test-jupiter-key";
/** The fixture pair: native SOL (wrapped by the setup transfer) into USDC. */
export const INPUT_MINT = WSOL_MINT;
export const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** 20 digits: fits a u64 arg exactly, crosses into BigInt territory, never a JS Number. */
export const AMOUNT = "10000000000000000000";
/** The quoted output: echoed exactly by the swap instruction's u64 arg. */
export const OUT_AMOUNT = "16900000000000000000";
export const COMPUTE_PRICE_MICRO_LAMPORTS = 100_000n;
/** 32 arbitrary bytes standing in for the provider's fetched blockhash; wire form is base58. */
export const BLOCKHASH_BYTES = Uint8Array.from({ length: 32 }, (_, i) => ((i * 7 + 3) % 255) + 1);
export const LAST_VALID_BLOCK_HEIGHT = 4_294_967_296;

/** Deterministic synthetic addresses with 32 meaningful bytes, valid base58 throughout. */
/** @param {number} seed */
const synthAddress = (seed) =>
  getBase58Decoder().decode(Uint8Array.from({ length: 32 }, (_, i) => ((seed + i) % 255) + 1));

export const ALT_ADDRESS = synthAddress(1);
export const POOL_AUTHORITY = synthAddress(2);
export const INPUT_VAULT = synthAddress(3);
export const OUTPUT_VAULT = synthAddress(4);
export const EVENT_AUTHORITY = "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf";

/** @param {Uint8Array} bytes */
const toBase64 = (bytes) => getBase64Codec().decode(bytes);
/** @param {string} pubkey @param {boolean} isWritable @param {boolean} isSigner */
const meta = (pubkey, isWritable, isSigner) => ({ pubkey, isWritable, isSigner });

/** Provider tolerance floor: floor(outAmount x (10000 - bps) / 10000), BigInt throughout. */
/** @param {string} outAmount @param {number} slippageBps */
export const minOutFor = (outAmount, slippageBps) =>
  String((BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n);

export const cuPriceInstruction = () => ({
  programId: COMPUTE_BUDGET_PROGRAM,
  accounts: [],
  data: toBase64(Uint8Array.of(3, ...getU64Codec().encode(COMPUTE_PRICE_MICRO_LAMPORTS))),
});

/** Idempotent create for the taker's destination (USDC) ATA: the account the swap credits. */
/** @param {string} taker @param {string} destinationAta */
export const destinationCreateInstruction = (taker, destinationAta) => ({
  programId: ATA_PROGRAM,
  accounts: [
    meta(taker, true, true),
    meta(destinationAta, true, false),
    meta(taker, false, false),
    meta(OUTPUT_MINT, false, false),
    meta(SYSTEM_PROGRAM, false, false),
    meta(TOKEN_PROGRAM, false, false),
  ],
  data: toBase64(Uint8Array.of(1)),
});

/** The documented wSOL wrap: a System transfer of the full input amount to the taker's wSOL ATA. */
/** @param {string} taker @param {string} sourceAta */
export const wsolFundingInstruction = (taker, sourceAta) => ({
  programId: SYSTEM_PROGRAM,
  accounts: [meta(taker, true, true), meta(sourceAta, true, false)],
  data: toBase64(Uint8Array.of(2, 0, 0, 0, ...getU64Codec().encode(BigInt(AMOUNT)))),
});

/** The wrap's second half: SyncNative turns the transferred lamports into spendable wSOL. */
/** @param {string} sourceAta */
export const syncNativeInstruction = (sourceAta) => ({
  programId: TOKEN_PROGRAM,
  accounts: [meta(sourceAta, true, false)],
  data: toBase64(Uint8Array.of(17)),
});

/** Closes the taker's emptied wSOL account; rent returns to the taker. */
/** @param {string} taker @param {string} sourceAta */
export const cleanupInstruction = (taker, sourceAta) => ({
  programId: TOKEN_PROGRAM,
  accounts: [meta(sourceAta, true, false), meta(taker, true, false), meta(taker, true, true)],
  data: toBase64(Uint8Array.of(9)),
});
