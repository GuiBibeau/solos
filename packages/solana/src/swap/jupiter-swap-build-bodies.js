// @ts-check
import {
  getBase58Decoder,
  getBase64Codec,
  getU16Codec,
  getU32Codec,
  getU64Codec,
} from "@solana/kit";
import { createHash } from "node:crypto";
import {
  ATA_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  JUP6_PROGRAM,
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
 * sha256("global:route") and whose args tail is the documented borsh
 * (routePlan, inAmount, quotedOutAmount, slippageBps, platformFeeBps, routePlanLen). The
 * fixture route plan is an empty vector: the executor never decodes route legs — it validates
 * the program, the accounts, and the envelope amounts, and the chain executes the real thing.
 */

export const KEY = "test-jupiter-key";
/** The fixture pair: native SOL (wrapped by the setup transfer) into USDC. */
export const INPUT_MINT = WSOL_MINT;
export const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** 20 digits: crosses into u64 instruction args exactly, never through a JS Number. */
export const AMOUNT = "10000000000000000000";
/** Instruction-arg echo of the quoted output; the envelope outAmount stays 30 digits. */
export const QUOTED_OUT_AMOUNT = "16900000000000000000";
/** 30 digits: envelope amounts are BigInt territory only, never a JS Number. */
export const OUT_AMOUNT = "169900000000000000000000000000";
export const COMPUTE_PRICE_MICRO_LAMPORTS = 100_000n;
/** 32 arbitrary bytes standing in for the provider's fetched blockhash; wire form is base58. */
export const BLOCKHASH_BYTES = Uint8Array.from({ length: 32 }, (_, i) => ((i * 7 + 3) % 255) + 1);
export const LAST_VALID_BLOCK_HEIGHT = 4_294_967_296;
/** Jupiter v6 anchor route discriminator: the first 8 bytes of sha256("global:route"). */
export const ROUTE_DISCRIMINATOR = createHash("sha256").update("global:route").digest().slice(0, 8);

/** Deterministic synthetic addresses with 32 meaningful bytes, valid base58 throughout. */
const synthAddress = (seed) =>
  getBase58Decoder().decode(Uint8Array.from({ length: 32 }, (_, i) => ((seed + i) % 255) + 1));

export const ALT_ADDRESS = synthAddress(1);
export const POOL_AUTHORITY = synthAddress(2);
export const INPUT_VAULT = synthAddress(3);
export const OUTPUT_VAULT = synthAddress(4);
export const EVENT_AUTHORITY = synthAddress(5);

const toBase64 = (bytes) => getBase64Codec().decode(bytes);
const meta = (pubkey, isWritable, isSigner) => ({ pubkey, isWritable, isSigner });

/** Provider tolerance floor: floor(outAmount x (10000 - bps) / 10000), BigInt throughout. */
export const minOutFor = (outAmount, slippageBps) =>
  String((BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n);

export const cuPriceInstruction = () => ({
  programId: COMPUTE_BUDGET_PROGRAM,
  accounts: [],
  data: toBase64(Uint8Array.of(3, ...getU64Codec().encode(COMPUTE_PRICE_MICRO_LAMPORTS))),
});

/** Idempotent create for the taker's destination (USDC) ATA: the account the swap credits. */
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
export const wsolFundingInstruction = (taker, sourceAta) => ({
  programId: SYSTEM_PROGRAM,
  accounts: [meta(taker, true, true), meta(sourceAta, true, false)],
  data: toBase64(Uint8Array.of(2, ...getU64Codec().encode(BigInt(AMOUNT)))),
});

/** Jupiter v6 `route` over the taker's derived ATAs; pool accounts ride the lookup table. */
export const swapInstruction = (taker, sourceAta, destinationAta) => ({
  programId: JUP6_PROGRAM,
  accounts: [
    meta(taker, true, true),
    meta(sourceAta, true, false),
    meta(destinationAta, true, false),
    meta(INPUT_MINT, true, false),
    meta(OUTPUT_MINT, true, false),
    meta(POOL_AUTHORITY, true, false),
    meta(INPUT_VAULT, true, false),
    meta(OUTPUT_VAULT, false, false),
    meta(EVENT_AUTHORITY, false, false),
    meta(JUP6_PROGRAM, false, false),
  ],
  data: toBase64(
    Uint8Array.of(
      ...ROUTE_DISCRIMINATOR,
      ...getU32Codec().encode(0),
      ...getU64Codec().encode(BigInt(AMOUNT)),
      ...getU64Codec().encode(BigInt(QUOTED_OUT_AMOUNT)),
      50,
      0,
      ...getU16Codec().encode(0),
    ),
  ),
});

/** Closes the taker's emptied wSOL account; rent returns to the taker. */
export const cleanupInstruction = (taker, sourceAta) => ({
  programId: TOKEN_PROGRAM,
  accounts: [meta(sourceAta, true, false), meta(taker, true, false), meta(taker, true, true)],
  data: toBase64(Uint8Array.of(9)),
});
