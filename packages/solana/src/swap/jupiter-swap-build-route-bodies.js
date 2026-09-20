// @ts-check
import { getBase64Codec, getU16Codec, getU32Codec, getU64Codec } from "@solana/kit";
import {
  AMOUNT,
  EVENT_AUTHORITY,
  INPUT_MINT,
  INPUT_VAULT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  OUTPUT_VAULT,
  POOL_AUTHORITY,
} from "./jupiter-swap-build-bodies.js";
import {
  ROUTE_V2_DISCRIMINATOR,
  SHARED_ROUTE_V2_DISCRIMINATOR,
} from "./jupiter-swap-build-swapdata.js";
import { JUP6_PROGRAM, TOKEN_PROGRAM } from "./jupiter-swap-build-validate.js";

/** @param {string} pubkey @param {boolean} isWritable @param {boolean} isSigner */
const meta = (pubkey, isWritable, isSigner) => ({ pubkey, isWritable, isSigner });

/** @param {Uint8Array} discriminator @param {number[]} [prefix] */
const routeData = (discriminator, prefix = []) =>
  getBase64Codec().decode(
    Uint8Array.of(
      ...discriminator,
      ...prefix,
      ...getU64Codec().encode(BigInt(AMOUNT)),
      ...getU64Codec().encode(BigInt(OUT_AMOUNT)),
      ...getU16Codec().encode(50),
      ...getU16Codec().encode(0),
      ...getU16Codec().encode(0),
      ...getU32Codec().encode(1),
      125,
      0,
      ...getU16Codec().encode(10_000),
      0,
      1,
    ),
  );

/** Current direct `route_v2` prefix. Index 7 is Anchor's optional-account placeholder. */
/** @param {string} taker @param {string} sourceAta @param {string} destinationAta */
export const swapInstruction = (taker, sourceAta, destinationAta) => ({
  programId: JUP6_PROGRAM,
  accounts: [
    meta(taker, false, true),
    meta(sourceAta, true, false),
    meta(destinationAta, true, false),
    meta(INPUT_MINT, false, false),
    meta(OUTPUT_MINT, false, false),
    meta(TOKEN_PROGRAM, false, false),
    meta(TOKEN_PROGRAM, false, false),
    meta(JUP6_PROGRAM, false, false),
    meta(EVENT_AUTHORITY, false, false),
    meta(JUP6_PROGRAM, false, false),
    meta(POOL_AUTHORITY, false, false),
    meta(INPUT_VAULT, true, false),
    meta(OUTPUT_VAULT, true, false),
  ],
  data: routeData(ROUTE_V2_DISCRIMINATOR),
});

/** Current `shared_accounts_route_v2` fixed prefix followed by one route account. */
/** @param {string} taker @param {string} sourceAta @param {string} destinationAta */
export const sharedSwapInstruction = (taker, sourceAta, destinationAta) => ({
  programId: JUP6_PROGRAM,
  accounts: [
    meta(POOL_AUTHORITY, false, false),
    meta(taker, false, true),
    meta(sourceAta, true, false),
    meta(INPUT_VAULT, true, false),
    meta(OUTPUT_VAULT, true, false),
    meta(destinationAta, true, false),
    meta(INPUT_MINT, false, false),
    meta(OUTPUT_MINT, false, false),
    meta(TOKEN_PROGRAM, false, false),
    meta(TOKEN_PROGRAM, false, false),
    meta(EVENT_AUTHORITY, false, false),
    meta(JUP6_PROGRAM, false, false),
    meta(POOL_AUTHORITY, false, false),
  ],
  data: routeData(SHARED_ROUTE_V2_DISCRIMINATOR, [0]),
});
