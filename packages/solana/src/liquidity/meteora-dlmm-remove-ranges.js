// @ts-check
/**
 * Collapse per-bin removals into the fewest `RemoveLiquidityParams` ranges.
 *
 * The IDL struct is `min_bin_id`, `max_bin_id`, one `bps`, then 16 padding bytes.
 * Adjacent bin ids that share a bps become one inclusive range. A gap, or a different
 * bps, starts another range, so a bin left out of the removal is not covered by a
 * neighbor's bps. The quote still lists every occupied bin; only the wire form collapses.
 */

/** @typedef {{ readonly binId: number; readonly bps: number }} RemoveBin */
/** @typedef {{ minBinId: number; maxBinId: number; bps: number }} OpenRange */

/**
 * @param {OpenRange[]} ranges
 * @param {RemoveBin} bin
 */
const extendRange = (ranges, bin) => {
  const last = ranges.at(-1);
  if (last !== undefined && last.bps === bin.bps && bin.binId === last.maxBinId + 1) {
    last.maxBinId = bin.binId;
    return;
  }
  ranges.push({ minBinId: bin.binId, maxBinId: bin.binId, bps: bin.bps });
};

/**
 * @param {readonly RemoveBin[]} bins
 * @returns {readonly { readonly minBinId: number; readonly maxBinId: number; readonly bps: number }[]}
 */
export const collapseRemoveRanges = (bins) => {
  const ordered = bins.toSorted((left, right) => left.binId - right.binId);
  /** @type {OpenRange[]} */
  const ranges = [];
  for (const bin of ordered) extendRange(ranges, bin);
  return ranges;
};
