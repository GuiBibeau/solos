// @ts-check
import { describe, expect, test } from "bun:test";
import { GetPriceInputSchema } from "./types.js";

/** Well-known mints: wSOL, USDC, and the System Program (32 chars, decodes to 32 zero bytes). */
const VALID_MINTS = [
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "11111111111111111111111111111111",
];

describe("GetPriceInputSchema", () => {
  test("accepts well-known mints that decode to exactly 32 bytes", () => {
    for (const mint of VALID_MINTS) {
      expect(GetPriceInputSchema.safeParse({ mint }).success, mint).toBe(true);
    }
  });

  test("rejects base58 strings inside the character range that decode past 32 bytes", () => {
    for (const mint of ["z".repeat(44), "1".repeat(32) + "2", "1".repeat(33)]) {
      expect(GetPriceInputSchema.safeParse({ mint }).success, mint).toBe(false);
    }
  });

  test("keeps rejecting non-base58 and wrong-length values", () => {
    for (const mint of ["not-a-mint", "0".repeat(44), "1".repeat(31), "z".repeat(45)]) {
      expect(GetPriceInputSchema.safeParse({ mint }).success, mint).toBe(false);
    }
  });
});
