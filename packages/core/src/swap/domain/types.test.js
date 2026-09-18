// @ts-check
import { describe, expect, test } from "bun:test";
import { SwapQuoteRequestSchema } from "./types.js";

/** Well-known mints: wSOL, USDC, and the System Program (32 chars, decodes to 32 zero bytes). */
const VALID_MINTS = [
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "11111111111111111111111111111111",
];

/** @param {string} mint @param {string} amount */
const request = (mint, amount) => ({ inputMint: mint, outputMint: mint, amount });

describe("SwapQuoteRequestSchema", () => {
  test("accepts well-known mints that decode to exactly 32 bytes", () => {
    for (const mint of VALID_MINTS) {
      expect(SwapQuoteRequestSchema.safeParse(request(mint, "1000")).success, mint).toBe(true);
    }
  });

  test("rejects base58 strings inside the character range that decode past 32 bytes", () => {
    for (const mint of ["z".repeat(44), "1".repeat(32) + "2", "1".repeat(33)]) {
      expect(SwapQuoteRequestSchema.safeParse(request(mint, "1000")).success, mint).toBe(false);
    }
  });

  test("keeps rejecting non-base58 and wrong-length mints", () => {
    for (const mint of ["not-a-mint", "0".repeat(44), "1".repeat(31), "z".repeat(45)]) {
      expect(SwapQuoteRequestSchema.safeParse(request(mint, "1000")).success, mint).toBe(false);
    }
  });

  test("accepts positive-integer base-unit amounts, 30+ digits included", () => {
    for (const amount of ["1", "1000000000", "1000000000000000000000000000000"]) {
      expect(
        SwapQuoteRequestSchema.safeParse(request(VALID_MINTS[0], amount)).success,
        amount,
      ).toBe(true);
    }
  });

  test("rejects zero, negative, fractional, exponent, and padded amounts", () => {
    for (const amount of ["0", "-1", "1.5", "1e3", "01", "+1", " 1", "1 ", ""]) {
      expect(
        SwapQuoteRequestSchema.safeParse(request(VALID_MINTS[0], amount)).success,
        amount,
      ).toBe(false);
    }
  });

  test("amounts are strings, never coerced numbers", () => {
    expect(
      SwapQuoteRequestSchema.safeParse({ ...request(VALID_MINTS[0], "1000"), amount: 1000 })
        .success,
    ).toBe(false);
  });

  test("slippageBps stays inside the documented 0-10000 basis-point range", () => {
    const base = request(VALID_MINTS[0], "1000");
    for (const slippageBps of [0, 50, 10_000]) {
      expect(SwapQuoteRequestSchema.safeParse({ ...base, slippageBps }).success).toBe(true);
    }
    for (const slippageBps of [-1, 10_001, 0.5]) {
      expect(SwapQuoteRequestSchema.safeParse({ ...base, slippageBps }).success).toBe(false);
    }
  });

  test("defaults slippageBps to 50 when omitted", () => {
    const parsed = SwapQuoteRequestSchema.parse(request(VALID_MINTS[0], "1000"));
    expect(parsed.slippageBps).toBe(50);
  });
});
