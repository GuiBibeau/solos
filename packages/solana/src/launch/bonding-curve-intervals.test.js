// @ts-check
import { describe, expect, test } from "bun:test";
import { decodeBondingCurve } from "./bonding-curve.js";
import { bondingCurveBytes } from "./test-fixtures.js";

/**
 * Field-boundary lengths: the documented totals (49, 81, 82, 83, 115, 123, 124, 125) plus
 * padding decode; every intermediate length truncates exactly one encoded field in half and
 * is refused. A partial `quote_mint` in particular must never default to absent, which would
 * pass the account through the SOL-only quote gate.
 */

/** Full-layout defaults with distinctive reserves, cut to `bytes` when given. */
const curve = (overrides = {}) =>
  bondingCurveBytes({
    virtualTokenReserves: 1_073_000_000_000_000n,
    virtualQuoteReserves: 30_000_000_000n,
    realTokenReserves: 793_100_000_000_000n,
    realQuoteReserves: 1_000_000_000n,
    ...overrides,
  });

describe("bonding curve lengths truncated inside a field", () => {
  test("each invalid interval fails at its endpoints and midpoint, naming the truncated field", () => {
    const windows = /** @type {const} */ ([
      { field: "creator", low: 50, high: 80 },
      { field: "quote_mint", low: 84, high: 114 },
      { field: "creator_fee_bps", low: 116, high: 122 },
    ]);
    for (const { field, low, high } of windows) {
      for (const bytes of [low, Math.floor((low + high) / 2), high]) {
        expect(decodeBondingCurve(curve({ bytes })), `${bytes} bytes`).toMatchObject({
          status: "corrupt",
          reason: `curve account is truncated inside ${field}`,
        });
      }
    }
  });

  test("decoding flips exactly at the documented totals, and padding past 125 stays valid", () => {
    const boundaries = /** @type {const} */ ([
      { bytes: 49, decoded: true },
      { bytes: 50, decoded: false },
      { bytes: 80, decoded: false },
      { bytes: 81, decoded: true },
      { bytes: 83, decoded: true },
      { bytes: 84, decoded: false },
      { bytes: 114, decoded: false },
      { bytes: 115, decoded: true },
      { bytes: 122, decoded: false },
      { bytes: 123, decoded: true },
      { bytes: 125, decoded: true },
      { bytes: 126, decoded: true },
    ]);
    for (const { bytes, decoded } of boundaries) {
      const status = decodeBondingCurve(curve({ bytes })).status;
      expect(status, `${bytes} bytes`).toBe(decoded ? "decoded" : "corrupt");
    }
  });

  test("one padding byte past the full layout decodes identically to its 125-byte body", () => {
    const body = decodeBondingCurve(curve());
    const padded = decodeBondingCurve(curve({ bytes: 126 }));
    expect(body.status).toBe("decoded");
    expect(padded.status).toBe("decoded");
    if (body.status !== "decoded" || padded.status !== "decoded") return;
    expect(padded.layout).toEqual(body.layout);
  });

  test("a partial quote_mint is refused, never defaulted to an absent (SOL-paired) field", () => {
    // 100 bytes: the 83-byte legacy prefix plus 17 of quote_mint's 32.
    expect(decodeBondingCurve(curve({ bytes: 100 }))).toMatchObject({
      status: "corrupt",
      reason: "curve account is truncated inside quote_mint",
    });
  });
});
