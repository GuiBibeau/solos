// @ts-check
import { describe, expect, test } from "bun:test";
import { firstTickActions } from "./first-tick.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ACTION = { type: "transfer_sol", to: USDC, lamports: "1" };
const zeros = (/** @type {number} */ count) => "0".repeat(count);

/**
 * @param {"above" | "below"} condition
 * @param {string} threshold
 */
const draft = (condition, threshold) =>
  /** @type {import("@solos-sh/actions").StrategyDraft} */ ({
    kind: "trigger",
    params: {
      observe: { price: USDC },
      condition,
      priceUsd: threshold,
      action: ACTION,
      once: true,
    },
  });

/**
 * @param {"above" | "below"} condition
 * @param {string} observed
 * @param {string} threshold
 */
const emitted = (condition, observed, threshold) =>
  firstTickActions(draft(condition, threshold), observed);

describe("trigger price comparison", () => {
  test("values equal through exactly 18 fractional digits emit nothing", () => {
    const eighteen = `1.${"1".repeat(18)}`;
    const padded = `1.${zeros(18)}`;
    expect(emitted("above", eighteen, eighteen)).toEqual([]);
    expect(emitted("below", eighteen, eighteen)).toEqual([]);
    expect(emitted("above", padded, "1")).toEqual([]);
    expect(emitted("below", "1", padded)).toEqual([]);
  });

  test("a difference at the 18th digit is a strict above or below", () => {
    const lower = `1.${zeros(17)}1`;
    const higher = `1.${zeros(17)}2`;
    expect(emitted("above", higher, lower)).toEqual([ACTION]);
    expect(emitted("below", higher, lower)).toEqual([]);
    expect(emitted("above", lower, higher)).toEqual([]);
    expect(emitted("below", lower, higher)).toEqual([ACTION]);
  });

  test("a difference only past the 18th digit still decides above and below", () => {
    const lower = `1.${zeros(18)}1`;
    const higher = `1.${zeros(18)}2`;
    expect(emitted("above", lower, higher)).toEqual([]);
    expect(emitted("below", lower, higher)).toEqual([ACTION]);
    expect(emitted("above", higher, lower)).toEqual([ACTION]);
    expect(emitted("below", higher, lower)).toEqual([]);
  });

  test("an observed price exactly equal to priceUsd emits no Action", () => {
    expect(emitted("above", "150", "150")).toEqual([]);
    expect(emitted("below", "150", "150")).toEqual([]);
    expect(emitted("above", "1.50", "1.5")).toEqual([]);
    expect(emitted("below", "1.5", "1.50")).toEqual([]);
  });
});
