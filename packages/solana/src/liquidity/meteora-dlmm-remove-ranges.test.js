// @ts-check
/**
 * Per-bin removals collapse to IDL `RemoveLiquidityParams` ranges.
 *
 * Layout at `idls/dlmm.json`, lb_clmm 0.12.0, commit in `METEORA_DLMM_COMMIT`:
 * option<i32> min_bin_id, option<i32> max_bin_id, u16 bps, [u8; 16] padding.
 * Borsh `Some` is tag 1. The rebalance header plus the removes vec length is 84 bytes.
 * Empty `adds` and empty `RemainingAccountsInfo.slices` add 8 bytes, so N ranges are
 * 92 + 28*N bytes. A PositionV2 window is at most 70 bins; one shared bps is one entry.
 */
import { describe, expect, test } from "bun:test";
import { METEORA_DLMM_COMMIT } from "./meteora-dlmm-program.js";
import { rebalanceLiquidityData } from "./meteora-dlmm-rebalance.js";
import { collapseRemoveRanges } from "./meteora-dlmm-remove-ranges.js";

const PINNED_COMMIT = "576919e3e4368e542c402f000b4264724f7f23ec";

/** Inclusive 0..=2 at 10000 bps, the IDL field order above, padding zero. */
const CONTIGUOUS = Uint8Array.from([
  1, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0x10, 0x27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

/**
 * Independent borsh of one `RemoveLiquidityParams`. The contiguous literal locks this
 * helper; the other cases then only change the integers.
 * @param {number} minBinId
 * @param {number} maxBinId
 * @param {number} bps
 */
const idlRemoveParam = (minBinId, maxBinId, bps) => {
  const bytes = new Uint8Array(28);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 1);
  view.setInt32(1, minBinId, true);
  view.setUint8(5, 1);
  view.setInt32(6, maxBinId, true);
  view.setUint16(10, bps, true);
  return bytes;
};

/** @param {readonly { binId: number; bps: number }[]} removes */
const encoded = (removes) =>
  rebalanceLiquidityData({
    activeId: 0,
    maxActiveBinSlippage: 0,
    minWithdrawX: 1n,
    minWithdrawY: 1n,
    removes,
  });

/** @param {Uint8Array} data @param {number} at @param {Uint8Array} param */
const paramAt = (data, at, param) => {
  expect(data.slice(at, at + 28)).toEqual(param);
};

describe("meteora remove range collapse", () => {
  test("contiguous bins of one bps are one inclusive range", () => {
    expect(
      collapseRemoveRanges([
        { binId: 0, bps: 5000 },
        { binId: 1, bps: 5000 },
        { binId: 2, bps: 5000 },
      ]),
    ).toEqual([{ minBinId: 0, maxBinId: 2, bps: 5000 }]);
    expect(
      collapseRemoveRanges([
        { binId: 2, bps: 10_000 },
        { binId: 0, bps: 10_000 },
        { binId: 1, bps: 10_000 },
      ]),
    ).toEqual([{ minBinId: 0, maxBinId: 2, bps: 10_000 }]);
  });

  test("a gap stays separate ranges, and one bin is a range of that id", () => {
    expect(
      collapseRemoveRanges([
        { binId: 0, bps: 10_000 },
        { binId: 2, bps: 10_000 },
        { binId: 3, bps: 10_000 },
      ]),
    ).toEqual([
      { minBinId: 0, maxBinId: 0, bps: 10_000 },
      { minBinId: 2, maxBinId: 3, bps: 10_000 },
    ]);
    expect(collapseRemoveRanges([{ binId: -4, bps: 2500 }])).toEqual([
      { minBinId: -4, maxBinId: -4, bps: 2500 },
    ]);
  });

  test("a different bps on the next bin starts a new range", () => {
    expect(
      collapseRemoveRanges([
        { binId: 5, bps: 1000 },
        { binId: 6, bps: 10_000 },
      ]),
    ).toEqual([
      { minBinId: 5, maxBinId: 5, bps: 1000 },
      { minBinId: 6, maxBinId: 6, bps: 10_000 },
    ]);
  });
});

describe("rebalance remove encoding matches the pinned IDL", () => {
  test("a contiguous range is one RemoveLiquidityParams", () => {
    expect(METEORA_DLMM_COMMIT).toBe(PINNED_COMMIT);
    expect(idlRemoveParam(0, 2, 10_000)).toEqual(CONTIGUOUS);
    const data = encoded([
      { binId: 0, bps: 10_000 },
      { binId: 1, bps: 10_000 },
      { binId: 2, bps: 10_000 },
    ]);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(80, true)).toBe(1);
    paramAt(data, 84, CONTIGUOUS);
    expect(view.getUint32(112, true)).toBe(0);
    expect(view.getUint32(116, true)).toBe(0);
    expect(data).toHaveLength(92 + 28);
  });

  test("a gap encodes two params and does not cover the missing bin", () => {
    const data = encoded([
      { binId: 0, bps: 10_000 },
      { binId: 2, bps: 10_000 },
    ]);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(80, true)).toBe(2);
    paramAt(data, 84, idlRemoveParam(0, 0, 10_000));
    paramAt(data, 112, idlRemoveParam(2, 2, 10_000));
    expect(data).toHaveLength(92 + 56);
  });

  test("a single bin sets min_bin_id and max_bin_id to that id", () => {
    const data = encoded([{ binId: 4, bps: 2500 }]);
    paramAt(data, 84, idlRemoveParam(4, 4, 2500));
    expect(data).toHaveLength(92 + 28);
  });

  test("adjacent bins with different bps keep both bps values", () => {
    const data = encoded([
      { binId: 5, bps: 1000 },
      { binId: 6, bps: 10_000 },
    ]);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(80, true)).toBe(2);
    paramAt(data, 84, idlRemoveParam(5, 5, 1000));
    paramAt(data, 112, idlRemoveParam(6, 6, 10_000));
  });

  test("a full 70-bin window of one bps is one entry under the transaction data limit", () => {
    const bins = Array.from({ length: 70 }, (_, binId) => ({ binId, bps: 10_000 }));
    const data = encoded(bins);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(80, true)).toBe(1);
    paramAt(data, 84, idlRemoveParam(0, 69, 10_000));
    expect(data).toHaveLength(120);
    expect(data.length).toBeLessThan(1232);
  });
});
