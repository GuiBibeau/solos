// @ts-check
import { describe, expect, test } from "bun:test";
import { decodeBondingCurve } from "./bonding-curve.js";
import { bondingCurveBytes, u64le } from "./test-fixtures.js";

/** A full-layout curve with the override applied. @param {{ realQuoteReserves?: bigint; virtualTokenReserves?: bigint; virtualQuoteReserves?: bigint; realTokenReserves?: bigint }} [overrides] */
const curve = (overrides = {}) => bondingCurveBytes({ ...overrides });

describe("bonding curve u64 round-trips", () => {
  test("extreme u64 values survive the DataView round-trip exactly", () => {
    const read = decodeBondingCurve(
      curve({
        virtualTokenReserves: 18_446_744_073_709_551_615n,
        virtualQuoteReserves: 18_446_744_073_709_551_615n,
        realTokenReserves: 1n,
        realQuoteReserves: 0n,
      }),
    );
    if (read.status !== "decoded") throw new Error("expected a decode");
    expect(read.layout.virtualTokenReserves).toBe(18_446_744_073_709_551_615n);
    expect(read.layout.virtualQuoteReserves).toBe(18_446_744_073_709_551_615n);
    expect(read.layout.realTokenReserves).toBe(1n);
  });

  test("the stored bytes are little-endian u64", () => {
    // 1n encodes as 01 00 00 00 00 00 00 00.
    expect(u64le(1n)).toEqual(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]));
    const read = decodeBondingCurve(curve({ realQuoteReserves: 0x01_02_03_04_05_06_07_08n }));
    if (read.status !== "decoded") throw new Error("expected a decode");
    expect(read.layout.realQuoteReserves).toBe(0x01_02_03_04_05_06_07_08n);
  });
});
