// @ts-check
/**
 * ADR-0022 allocation is a pure function of the position window, the active bin, and the
 * budgets. The same inputs always produce the same `bin_liquidity_dist`.
 */
import { describe, expect, test } from "bun:test";
import {
  activeBinMoved,
  activeBinTolerance,
  allocateDeposit,
  uniformBps,
} from "./meteora-dlmm-allocate.js";
import { priceOfBin } from "./meteora-dlmm-price.js";

const ONE = 1n << 64n;

describe("meteora deposit allocation", () => {
  test("bin 0 is one in Q64.64 and a zero step is refused", () => {
    expect(priceOfBin(0, 1)).toBe(ONE);
    expect(priceOfBin(1, 1)).not.toBe(ONE);
    expect(priceOfBin(0, 0)).toBeNull();
  });

  test("uniform bps give the remainder to the lowest indexes", () => {
    expect(uniformBps(1)).toEqual([10_000]);
    expect(uniformBps(3)).toEqual([3334, 3333, 3333]);
    expect(activeBinTolerance(50, 1)).toBe(50);
    expect(activeBinTolerance(0, 1)).toBe(0);
    expect(activeBinMoved(0, 50, 50)).toBe(false);
    expect(activeBinMoved(0, 51, 50)).toBe(true);
  });

  test("an empty active bin fits both budgets to the price and drops the unused side", () => {
    const input = {
      lowerBinId: 0,
      upperBinId: 0,
      activeId: 0,
      binStep: 1,
      amountX: 1_000_000n,
      amountY: 2_000_000n,
      reserveX: 0n,
      reserveY: 0n,
    };
    const first = allocateDeposit(input);
    const second = allocateDeposit(input);
    expect(second).toEqual(first);
    expect(first).toEqual({
      status: "ok",
      allocation: {
        amountX: 1_000_000n,
        amountY: 1_000_000n,
        bins: [{ binId: 0, distributionX: 10_000, distributionY: 10_000 }],
        spentX: 1_000_000n,
        spentY: 1_000_000n,
        liquidity: 2_000_000n,
      },
    });
  });

  test("a window above the active bin takes only X, at the uniform bps, and invents no bins", () => {
    const result = allocateDeposit({
      lowerBinId: 10,
      upperBinId: 12,
      activeId: 0,
      binStep: 1,
      amountX: 10_000n,
      amountY: 5000n,
      reserveX: 0n,
      reserveY: 0n,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.allocation.amountX).toBe(10_000n);
    expect(result.allocation.amountY).toBe(0n);
    expect(result.allocation.spentX).toBe(10_000n);
    expect(result.allocation.spentY).toBe(0n);
    expect(result.allocation.bins).toEqual([
      { binId: 10, distributionX: 3334, distributionY: 0 },
      { binId: 11, distributionX: 3333, distributionY: 0 },
      { binId: 12, distributionX: 3333, distributionY: 0 },
    ]);
  });

  test("an active bin with reserves keeps the ratio and recomputes bps from the fitted amounts", () => {
    const input = {
      lowerBinId: -1,
      upperBinId: 1,
      activeId: 0,
      binStep: 1,
      amountX: 10_000n,
      amountY: 10_000n,
      reserveX: 3n,
      reserveY: 1n,
    };
    const first = allocateDeposit(input);
    expect(allocateDeposit(input)).toEqual(first);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.allocation.amountX).toBe(10_000n);
    expect(first.allocation.amountY).toBe(6666n);
    expect(first.allocation.spentX).toBe(10_000n);
    expect(first.allocation.spentY).toBe(6665n);
    expect(first.allocation.bins).toEqual([
      { binId: -1, distributionX: 0, distributionY: 7501 },
      { binId: 0, distributionX: 5000, distributionY: 2499 },
      { binId: 1, distributionX: 5000, distributionY: 0 },
    ]);
    expect(first.allocation.liquidity).toBe(16_665n);
  });
});
