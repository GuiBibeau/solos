// @ts-check
import { describe, expect, test } from "bun:test";
import { GetCurveInputSchema, LaunchCurveSchema } from "./types.js";

const MINT = "So11111111111111111111111111111111111111112";
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MAX_U64 = "18446744073709551615";

describe("launch curve input schema", () => {
  test("a 32-byte base58 mint is accepted", () => {
    expect(GetCurveInputSchema.safeParse({ mint: MINT }).success).toBe(true);
  });

  test("input with invalid base58 characters is rejected", () => {
    for (const mint of ["not-an-address", "0x1234", "l1O0mixed"]) {
      expect(GetCurveInputSchema.safeParse({ mint }).success).toBe(false);
    }
  });

  test("input that decodes to fewer than 32 bytes is rejected", () => {
    for (const mint of ["", "abc", "1"]) {
      expect(GetCurveInputSchema.safeParse({ mint }).success).toBe(false);
    }
  });

  test("a missing mint is rejected", () => {
    expect(GetCurveInputSchema.safeParse({}).success).toBe(false);
  });

  test("the mint argument is described", () => {
    expect(GetCurveInputSchema.shape.mint.description).toBeTruthy();
  });
});

/** A minimal valid LaunchCurve body. */
const valid = () => ({
  mint: MINT,
  program: PUMP_PROGRAM,
  complete: false,
  progressBps: 3500,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
});

describe("launch curve output schema", () => {
  test("the documented six-field shape parses", () => {
    const parsed = LaunchCurveSchema.safeParse(valid());
    expect(parsed.success).toBe(true);
  });

  test("the shape is exactly the six specified fields, with no `graduated` key", () => {
    expect(new Set(Object.keys(LaunchCurveSchema.shape))).toEqual(
      new Set([
        "mint",
        "program",
        "complete",
        "progressBps",
        "virtualSolReserves",
        "virtualTokenReserves",
      ]),
    );
  });

  test("progressBps accepts only integers inside 0..10000", () => {
    for (const bad of [-1, 10_001, 1.5, NaN]) {
      expect(LaunchCurveSchema.safeParse({ ...valid(), progressBps: bad }).success).toBe(false);
    }
    for (const good of [0, 1, 9999, 10_000]) {
      expect(LaunchCurveSchema.safeParse({ ...valid(), progressBps: good }).success).toBe(true);
    }
  });

  test("reserves accept u64 integer strings, including zero and the u64 maximum", () => {
    expect(LaunchCurveSchema.safeParse({ ...valid(), virtualSolReserves: "0" }).success).toBe(true);
    expect(LaunchCurveSchema.safeParse({ ...valid(), virtualTokenReserves: MAX_U64 }).success).toBe(
      true,
    );
  });

  test("reserves reject anything outside the exact integer-string grammar", () => {
    for (const bad of [
      "-1",
      "1.5",
      "1e9",
      " 1",
      "+1",
      "007",
      "",
      "18446744073709551616", // u64 maximum + 1
    ]) {
      expect(LaunchCurveSchema.safeParse({ ...valid(), virtualSolReserves: bad }).success).toBe(
        false,
      );
    }
  });

  test("a non-boolean complete flag is rejected", () => {
    expect(LaunchCurveSchema.safeParse({ ...valid(), complete: "yes" }).success).toBe(false);
  });
});
