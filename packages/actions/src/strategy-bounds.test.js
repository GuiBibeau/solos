// @ts-check
import { describe, expect, test } from "bun:test";
import { StrategyBoundsSchema } from "./index.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";

/** @returns {import("./strategy-bounds.js").StrategyBounds} */
const validBounds = () => ({
  maxNotionalPerTickUsd: "3",
  maxDailySpendUsd: "5",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 3,
});

/** @param {Record<string, unknown>} patch */
const parse = (patch) => StrategyBoundsSchema.safeParse({ ...validBounds(), ...patch });

describe("StrategyBoundsSchema", () => {
  test("parses bounds and keeps decimal strings exact", () => {
    const bounds = validBounds();
    expect(StrategyBoundsSchema.parse(bounds)).toEqual(bounds);
  });

  test("describes every field", () => {
    for (const field of Object.keys(validBounds())) {
      const description = StrategyBoundsSchema.shape[field]?.description ?? "";
      expect(description.length, field).toBeGreaterThan(10);
    }
  });

  test("accepts edge values: zero caps, a huge decimal, epoch zero, one failure, and mints", () => {
    const bounds = {
      maxNotionalPerTickUsd: "0",
      maxDailySpendUsd: "0.00",
      allowedMints: [USDC, USDC, WSOL],
      expiresAt: 0,
      maxConsecutiveFailures: 1,
    };
    expect(StrategyBoundsSchema.parse(bounds)).toEqual(bounds);
    const huge = `${"9".repeat(40)}.5`;
    expect(parse({ maxNotionalPerTickUsd: huge, maxDailySpendUsd: huge }).success).toBe(true);
    expect(parse({ expiresAt: 1_700_000_000_000, maxConsecutiveFailures: 1_000_000 }).success).toBe(
      true,
    );
  });

  test("rejects a missing field", () => {
    for (const field of Object.keys(validBounds())) {
      const bounds = validBounds();
      delete bounds[field];
      const result = StrategyBoundsSchema.safeParse(bounds);
      expect(result.success, field).toBe(false);
      if (!result.success)
        expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
    }
  });

  test("rejects invalid USD caps, mints, expiry, and failure counts", () => {
    const rejected = [
      { maxNotionalPerTickUsd: "-1" },
      { maxNotionalPerTickUsd: "-0" },
      { maxDailySpendUsd: -5 },
      { maxDailySpendUsd: "5 USD" },
      { maxDailySpendUsd: "" },
      { maxNotionalPerTickUsd: " 3" },
      { allowedMints: ["nope"] },
      { allowedMints: USDC },
      { expiresAt: "0" },
      { expiresAt: -1 },
      { expiresAt: 1.5 },
      { maxConsecutiveFailures: 0 },
      { maxConsecutiveFailures: -1 },
      { maxConsecutiveFailures: 1.5 },
      { maxConsecutiveFailures: "3" },
    ];
    for (const patch of rejected) {
      expect(parse(patch).success, JSON.stringify(patch)).toBe(false);
    }
  });

  test("names the field when a cap or a mint is invalid", () => {
    const cap = parse({ maxDailySpendUsd: "-0.01" });
    const mint = parse({ allowedMints: ["not-a-mint"] });
    expect(cap.success).toBe(false);
    expect(mint.success).toBe(false);
    if (!cap.success) expect(cap.error.issues[0]?.path).toEqual(["maxDailySpendUsd"]);
    if (!mint.success) expect(mint.error.issues[0]?.path[0]).toBe("allowedMints");
  });
});
