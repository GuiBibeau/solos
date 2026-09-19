// @ts-check
import { describe, expect, test } from "bun:test";
import { ValidationError } from "../../shared/domain/errors.js";
import { lotsToBaseUnits, parseLots, quoteLotsToUsd, sideFromLots } from "./lots.js";

describe("parseLots", () => {
  test("accepts signed integer lot strings", () => {
    expect(parseLots("1500")).toBe(1500n);
    expect(parseLots("-1500")).toBe(-1500n);
    expect(parseLots("0")).toBe(0n);
    expect(parseLots("-0")).toBe(0n);
  });

  test("rejects floats, blanks, exponents and non-strings", () => {
    for (const bad of ["15.0", "", " ", "+1", "1e3", "0x10", "1_000", null, undefined, 15]) {
      expect(() => parseLots(/** @type {any} */ (bad)), String(bad)).toThrow(ValidationError);
    }
  });
});

describe("sideFromLots", () => {
  test("sign is the direction; flat is exactly zero", () => {
    expect(sideFromLots(1n)).toBe("long");
    expect(sideFromLots(150_000n)).toBe("long");
    expect(sideFromLots(-1n)).toBe("short");
    expect(sideFromLots(-150_000n)).toBe("short");
    expect(sideFromLots(0n)).toBe("flat");
  });
});

describe("lotsToBaseUnits", () => {
  test("converts base lots to base units exactly, sign carried", () => {
    expect(lotsToBaseUnits(1500n, 2)).toBe("15");
    expect(lotsToBaseUnits(-1500n, 2)).toBe("-15");
    expect(lotsToBaseUnits(1n, 2)).toBe("0.01");
    expect(lotsToBaseUnits(-1n, 2)).toBe("-0.01");
    expect(lotsToBaseUnits(1400n, 2)).toBe("14");
    expect(lotsToBaseUnits(123_456_789n, 9)).toBe("0.123456789");
  });

  test("zero is the plain string zero, never negative zero", () => {
    expect(lotsToBaseUnits(0n, 2)).toBe("0");
    expect(lotsToBaseUnits(0n, 0)).toBe("0");
  });

  test("a zero lot size is legal and divides exactly", () => {
    expect(lotsToBaseUnits(7n, 0)).toBe("7");
    expect(lotsToBaseUnits(-7n, 0)).toBe("-7");
  });

  test("rejects fractional or negative lot sizes before any math", () => {
    for (const bad of [1.5, -1]) {
      expect(() => lotsToBaseUnits(1n, /** @type {any} */ (bad))).toThrow(ValidationError);
    }
  });

  test("stays exact far beyond the double-precision range", () => {
    expect(lotsToBaseUnits(123_456_789_012_345_678_901n, 2)).toBe("1234567890123456789.01");
  });
});

describe("quoteLotsToUsd", () => {
  test("one quote lot is one micro-USDC", () => {
    expect(quoteLotsToUsd(1_234_567n)).toBe("1.234567");
    expect(quoteLotsToUsd(-100n)).toBe("-0.0001");
    expect(quoteLotsToUsd(0n)).toBe("0");
    expect(quoteLotsToUsd(1_000_000n)).toBe("1");
  });
});
