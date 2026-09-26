// @ts-check
/**
 * Bin-array indexing and the pinned withdrawal amount for one share.
 *
 * `bin_id_to_bin_array_index` is floor division by `MAX_BIN_PER_ARRAY` (70), including
 * negative ids (`div_euclid`). A position holds at most 70 bins, so it touches at most two
 * arrays. The PDA is `["bin_array", lb_pair, i64le(index)]` under the pinned program
 * (`deriveBinArray` in the pinned SDK).
 *
 * Token amounts are `Bin::calculate_out_amount` at the pinned commit: for each occupied
 * bin, `floor(share * amount_x / liquidity_supply)` and the same for Y, then summed.
 * That is `safe_mul_div_cast(..., Rounding::Down)` in `commons/src/extensions/bin.rs`.
 * Unclaimed fees and rewards are not principal (ADR-0022).
 */
import { address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { BIN_ARRAY_SEED, BINS_PER_ARRAY, METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

const utf8 = getUtf8Encoder();
const addressEncoder = getAddressEncoder();

/** @typedef {{ readonly binId: number; readonly share: bigint }} OccupiedBin */
/** @typedef {{ readonly status: "ok"; readonly bins: readonly OccupiedBin[]; readonly liquidity: bigint } | { readonly status: "corrupt"; readonly reason: string }} WindowRead */
/** @typedef {{ readonly status: "ok"; readonly amount: bigint } | { readonly status: "corrupt"; readonly reason: string }} ShareAmount */
/** @typedef {{ readonly status: "ok"; readonly amountX: bigint; readonly amountY: bigint } | { readonly status: "corrupt"; readonly reason: string }} AmountRead */

/** @param {string} reason @returns {{ readonly status: "corrupt"; readonly reason: string }} */
const corrupt = (reason) => ({ status: "corrupt", reason });

/** Floor-divide a bin id into its bin-array index. Negative ids use floor, not trunc.
 * @param {number} binId
 */
export const binArrayIndexOf = (binId) => Math.floor(binId / BINS_PER_ARRAY);

/** Slot of `binId` inside its array, 0..69.
 * @param {number} binId
 */
export const binOffset = (binId) => binId - binArrayIndexOf(binId) * BINS_PER_ARRAY;

/**
 * Bin-array PDA for one pair and index.
 * @param {string} lbPair
 * @param {number} index
 * @returns {Promise<string>}
 */
export const binArrayAddress = (lbPair, index) => {
  const indexBytes = new Uint8Array(8);
  new DataView(indexBytes.buffer).setBigInt64(0, BigInt(index), true);
  return getProgramDerivedAddress({
    programAddress: address(METEORA_DLMM_PROGRAM),
    seeds: [
      utf8.encode(BIN_ARRAY_SEED),
      new Uint8Array(addressEncoder.encode(address(lbPair))),
      indexBytes,
    ],
  }).then(([pda]) => pda);
};

/**
 * Occupied bins inside the declared window, plus the exact share sum (ADR-0022: the sum may
 * exceed u128). A share past `upper_bin_id` is corrupt rather than silently dropped.
 * @param {{ readonly lowerBinId: number; readonly upperBinId: number; readonly shares: readonly bigint[] }} position
 * @returns {WindowRead}
 */
export const positionWindow = (position) => {
  if (position.lowerBinId > position.upperBinId) return corrupt("position bin window is inverted");
  const width = position.upperBinId - position.lowerBinId + 1;
  if (width > BINS_PER_ARRAY) return corrupt("position bin window does not fit the share array");
  return collectShares(position.lowerBinId, width, position.shares);
};

/**
 * @param {number} lowerBinId
 * @param {number} width
 * @param {readonly bigint[]} shares
 * @returns {WindowRead}
 */
const collectShares = (lowerBinId, width, shares) => {
  /** @type {OccupiedBin[]} */
  const bins = [];
  let liquidity = 0n;
  for (let index = 0; index < BINS_PER_ARRAY; index += 1) {
    const share = shares[index] ?? 0n;
    if (index >= width) {
      if (share !== 0n) return corrupt("liquidity share sits outside the position bin window");
      continue;
    }
    if (share === 0n) continue;
    liquidity += share;
    bins.push({ binId: lowerBinId + index, share });
  }
  return { status: "ok", bins, liquidity };
};

/**
 * One side of `calculate_out_amount`. Zero supply and a share above the supply are refused;
 * the program cannot pay either.
 * @param {bigint} share
 * @param {bigint} amount
 * @param {bigint} supply
 * @returns {ShareAmount}
 */
export const shareOfBin = (share, amount, supply) => {
  if (supply === 0n) return corrupt("bin liquidity supply is zero");
  if (share > supply) return corrupt("bin liquidity share exceeds the bin supply");
  return { status: "ok", amount: (share * amount) / supply };
};

/**
 * Sum per-bin principal, X then Y, rounding each side down before the add.
 * @param {readonly OccupiedBin[]} bins
 * @param {(binId: number) => { readonly amountX: bigint; readonly amountY: bigint; readonly liquiditySupply: bigint } | undefined} slotFor
 * @returns {AmountRead}
 */
export const sumBinAmounts = (bins, slotFor) => {
  let amountX = 0n;
  let amountY = 0n;
  for (const bin of bins) {
    const slot = slotFor(bin.binId);
    if (slot === undefined) return corrupt("referenced bin is missing from its bin array");
    const x = shareOfBin(bin.share, slot.amountX, slot.liquiditySupply);
    if (x.status !== "ok") return x;
    const y = shareOfBin(bin.share, slot.amountY, slot.liquiditySupply);
    if (y.status !== "ok") return y;
    amountX += x.amount;
    amountY += y.amount;
  }
  return { status: "ok", amountX, amountY };
};
