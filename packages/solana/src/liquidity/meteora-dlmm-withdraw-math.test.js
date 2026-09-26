// @ts-check
/**
 * Per-bin share reduction. A full exit must leave zero shares even when the share is
 * not a round multiple of the basis, the same dust class as Raydium #131.
 */
import { describe, expect, test } from "bun:test";
import { quoteRemoval, sharesLeft, sharesRemoved } from "./meteora-dlmm-withdraw-math.js";

const AWKWARD = (1n << 100n) + 7n;

const TWO_BINS = new Map([
  [0, { amountX: 1000n, amountY: 0n, liquiditySupply: 1000n }],
  [2, { amountX: 0n, amountY: 800n, liquiditySupply: 400n }],
]);

/** @param {number} binId */
const twoBinSlot = (binId) => TWO_BINS.get(binId);

/** @param {{ amountX: bigint; amountY: bigint; supply: bigint }} bin */
const oneBinSlot = (bin) => (/** @type {number} */ id) =>
  id === 0
    ? { amountX: bin.amountX, amountY: bin.amountY, liquiditySupply: bin.supply }
    : undefined;

describe("meteora withdraw share math", () => {
  test("a full exit removes the stored share and leaves zero", () => {
    expect(sharesRemoved(AWKWARD, 10_000)).toBe(AWKWARD);
    expect(sharesLeft(AWKWARD, 10_000)).toBe(0n);
    expect(sharesLeft(3n, 10_000)).toBe(0n);
  });

  test("a partial remove floors each bin and can leave a remainder", () => {
    expect(sharesRemoved(3n, 5000)).toBe(1n);
    expect(sharesLeft(3n, 5000)).toBe(2n);
    expect(sharesRemoved(1n, 1)).toBe(0n);
  });

  test("partial and full quotes cover occupied bins and floor the receipt", () => {
    const bins = [
      { binId: 0, share: 1000n },
      { binId: 2, share: 400n },
    ];
    const partial = quoteRemoval({ bins, bps: 5000, maxSlippageBps: 50, slotFor: twoBinSlot });
    expect(partial).toMatchObject({
      status: "ok",
      liquidity: 700n,
      estA: 500n,
      estB: 400n,
      minA: 497n,
      minB: 398n,
      removes: [
        { binId: 0, bps: 5000 },
        { binId: 2, bps: 5000 },
      ],
      remaining: [
        { binId: 0, share: 500n },
        { binId: 2, share: 200n },
      ],
    });
    const full = quoteRemoval({ bins, bps: 10_000, maxSlippageBps: 50, slotFor: twoBinSlot });
    expect(full.status).toBe("ok");
    if (full.status !== "ok") return;
    expect(full.liquidity).toBe(1400n);
    expect(full.removes).toEqual([
      { binId: 0, bps: 10_000 },
      { binId: 2, bps: 10_000 },
    ]);
    expect(full.remaining.every((bin) => bin.share === 0n)).toBe(true);
  });

  test("an all-zero removal and a nonzero quote rounded to a zero minimum are refused", () => {
    const bins = [{ binId: 0, share: 1n }];
    const zero = quoteRemoval({
      bins,
      bps: 1,
      maxSlippageBps: 0,
      slotFor: oneBinSlot({ amountX: 1n, amountY: 0n, supply: 1n }),
    });
    expect(zero.status === "reject" && zero.reason).toContain("zero liquidity");
    const rounded = quoteRemoval({
      bins,
      bps: 10_000,
      maxSlippageBps: 9999,
      slotFor: oneBinSlot({ amountX: 1n, amountY: 0n, supply: 1n }),
    });
    expect(rounded.status === "reject" && rounded.reason).toContain("zero minimum");
  });
});
