// @ts-check
import { describe, expect, test } from "bun:test";
import { priceAPerB } from "./meteora-dlmm-pool-price.js";

/**
 * activeId 1 and binStep 100. The Q64 step truncates `(100 << 64) / 10000`, so the price is
 * not the real 1.01. This is that truncated value, computed independently of the formatter.
 */
const BIN_ONE_STEP_100 = "1.00999999999999999999132638262011596452794037759304046630859375";

describe("Meteora active-bin price", () => {
  test("bin 0 is 1 raw, shifted by the mint decimals", () => {
    expect(priceAPerB({ activeId: 0, binStep: 25, decimalsA: 9, decimalsB: 6 })).toBe("1000");
    expect(priceAPerB({ activeId: 0, binStep: 1, decimalsA: 6, decimalsB: 9 })).toBe("0.001");
    expect(priceAPerB({ activeId: 0, binStep: 4, decimalsA: 9, decimalsB: 9 })).toBe("1");
  });

  test("a nonzero bin keeps the Q64 price and the decimal shift", () => {
    expect(priceAPerB({ activeId: 1, binStep: 100, decimalsA: 9, decimalsB: 9 })).toBe(
      BIN_ONE_STEP_100,
    );
    expect(priceAPerB({ activeId: 1, binStep: 100, decimalsA: 9, decimalsB: 6 })).toBe(
      "1009.99999999999999999132638262011596452794037759304046630859375",
    );
  });

  test("a zero bin step and an out-of-range exponent are not a price", () => {
    expect(priceAPerB({ activeId: 0, binStep: 0, decimalsA: 9, decimalsB: 6 })).toBeNull();
    expect(priceAPerB({ activeId: 600_000, binStep: 1, decimalsA: 9, decimalsB: 9 })).toBeNull();
  });
});
