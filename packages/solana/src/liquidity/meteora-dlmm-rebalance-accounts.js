// @ts-check
/**
 * Accounts `rebalance_liquidity` names, derived from a guarded position. Nothing here signs.
 * The bitmap extension is required only when a removed bin leaves the default bitmap.
 */
import { bitmapExtensionAddress, eventAuthorityAddress } from "./meteora-dlmm-bins.js";
import { isOutsideDefaultBitmap, METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";
import { ata } from "./raydium-clmm-plan-reads.js";

/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */

/**
 * @param {{ owner: string; positionAddress: string; position: MeteoraPositionLayout;
 *   pair: MeteoraPairLayout; programs: { tokenX: string; tokenY: string };
 *   indexes: readonly number[]; binArrays: readonly string[] }} parts
 */
export const rebalanceAccounts = async (parts) => {
  const { owner, positionAddress, position, pair, programs, indexes, binArrays } = parts;
  const isOverflow = indexes.some((index) => isOutsideDefaultBitmap(index));
  const [userTokenX, userTokenY, bitmapExtension, eventAuthority] = await Promise.all([
    ata(owner, pair.tokenMintX, programs.tokenX),
    ata(owner, pair.tokenMintY, programs.tokenY),
    isOverflow ? bitmapExtensionAddress(position.lbPair) : Promise.resolve(METEORA_DLMM_PROGRAM),
    eventAuthorityAddress(),
  ]);
  return {
    position: positionAddress,
    lbPair: position.lbPair,
    bitmapExtension,
    userTokenX,
    userTokenY,
    reserveX: pair.reserveX,
    reserveY: pair.reserveY,
    tokenXMint: pair.tokenMintX,
    tokenYMint: pair.tokenMintY,
    owner,
    rentPayer: owner,
    tokenXProgram: programs.tokenX,
    tokenYProgram: programs.tokenY,
    eventAuthority,
    binArrays,
  };
};
