// @ts-check
import { describe, expect, test } from "bun:test";
import { formatApy } from "./apy.js";

/**
 * `formatApy` is the only APY conversion in the slice: verbatim `String()` of the SDK's
 * finite non-negative number, null for anything that is not an APY. Expected strings below
 * are the documented JS `Number.prototype.toString` outputs, hand-derived, never computed by
 * re-running the implementation under test.
 */
describe("formatApy", () => {
  test("0.05 formats as the fractional decimal string 0.05", () => {
    expect(formatApy(0.05)).toBe("0.05");
  });

  test("zero formats as 0 — a flat rate is still a successful read", () => {
    expect(formatApy(0)).toBe("0");
  });

  test("one formats as 1 (100% APY)", () => {
    expect(formatApy(1)).toBe("1");
  });

  test("typical Kamino-scale rates keep the SDK's full shortest round-trip", () => {
    expect(formatApy(0.08577698320830018)).toBe("0.08577698320830018");
    expect(formatApy(0.06638400504828557)).toBe("0.06638400504828557");
  });

  test("very small rates surface in e-notation verbatim, never truncated", () => {
    expect(formatApy(5e-7)).toBe("5e-7");
    expect(formatApy(1.5e-17)).toBe("1.5e-17");
  });

  test("rates above 100% stay fractional decimals", () => {
    expect(formatApy(12.5)).toBe("12.5");
  });

  test("negative values are not APYs and return null", () => {
    expect(formatApy(-0.05)).toBeNull();
  });

  test("non-finite values are not APYs and return null", () => {
    expect(formatApy(NaN)).toBeNull();
    expect(formatApy(Infinity)).toBeNull();
    expect(formatApy(-Infinity)).toBeNull();
  });
});
