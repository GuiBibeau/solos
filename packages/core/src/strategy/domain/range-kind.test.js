// @ts-check
import { describe, expect, test } from "bun:test";
import { ActionSchema, RangeParamsSchema } from "@solos-sh/actions";
import { evaluateRange, RANGE_OBSERVATIONS } from "./range-kind.js";

const POOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POSITION = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
const INSTANT = 1_700_000_000_000;
const DAY = Math.floor(INSTANT / 86_400_000);

const params = RangeParamsSchema.parse({
  protocol: "meteora",
  pool: POOL,
  position: POSITION,
  width: 4,
  recenterWhenOutsideFor: 3,
  maxRecentersPerDay: 2,
});

/** @param {Record<string, string | number>} patch */
const observed = (patch) => ({
  instant: INSTANT,
  activeId: 5,
  binStep: 25,
  tokenAMint: POOL,
  tokenADecimals: 6,
  tokenBMint: POSITION,
  tokenBDecimals: 9,
  priceAPerB: "1",
  poolAt: "2026-10-28T00:00:00.000Z",
  position: POSITION,
  lowerBinId: 0,
  upperBinId: 10,
  amountA: "1000",
  amountB: "2000",
  valueUsd: "3",
  priceA: "1",
  priceB: "2",
  ...patch,
});

describe("evaluateRange", () => {
  test("declares the pool, the position, and the instant", () => {
    expect(RANGE_OBSERVATIONS).toContain("activeId");
    expect(RANGE_OBSERVATIONS).toContain("lowerBinId");
    expect(RANGE_OBSERVATIONS).toContain("instant");
    expect(RANGE_OBSERVATIONS).toContain("valueUsd");
  });

  test("an active bin inside the range emits nothing and resets the streak", () => {
    const decision = evaluateRange(params, observed({}), {
      outsideStreak: 4,
      lastRecenterIntents: ["i1"],
    });
    expect(decision.actions).toEqual([]);
    expect(decision.state).toMatchObject({
      outsideStreak: 0,
      activeId: 5,
      lowerBinId: 0,
      upperBinId: 10,
      position: POSITION,
      lastRecenterIntents: ["i1"],
    });
    expect(decision.note).toContain("inside");
  });

  test("outside for fewer ticks than the debounce increments the streak", () => {
    const decision = evaluateRange(params, observed({ activeId: 20 }), { outsideStreak: 1 });
    expect(decision.actions).toEqual([]);
    expect(decision.state).toMatchObject({ outsideStreak: 2, recentersToday: 0 });
    expect(decision.note).toContain("2");
  });

  test("outside for long enough emits four actions centred on the active bin", () => {
    const decision = evaluateRange(params, observed({ activeId: 20 }), { outsideStreak: 2 });
    expect(decision.actions.map((action) => action.type)).toEqual([
      "remove_liquidity",
      "close_position",
      "open_position",
      "add_liquidity",
    ]);
    expect(decision.actions[2]).toMatchObject({ lowerBinId: 18, width: 4, pool: POOL });
    expect(decision.actions[3]).toMatchObject({
      amountA: "1000",
      amountB: "2000",
      position: POSITION,
      maxSlippageBps: 50,
    });
    expect(decision.state).toMatchObject({
      lowerBinId: 18,
      upperBinId: 21,
      outsideStreak: 0,
      recentersToday: 1,
      recenterDay: DAY,
      lastRecenterAt: INSTANT,
    });
    expect(decision.revert).toMatchObject({
      recentersToday: 0,
      outsideStreak: 3,
      position: POSITION,
    });
    for (const action of decision.actions)
      expect(ActionSchema.safeParse(action).success).toBe(true);
  });

  test("a spent daily budget records the reason and emits nothing", () => {
    const decision = evaluateRange(params, observed({ activeId: 20 }), {
      outsideStreak: 2,
      recentersToday: 2,
      recenterDay: DAY,
    });
    expect(decision.actions).toEqual([]);
    expect(decision.reason).toContain("maxRecentersPerDay");
    expect(decision.state).toMatchObject({ outsideStreak: 3, recentersToday: 2 });
  });

  test("a missing position range fails the tick", () => {
    const decision = evaluateRange(params, observed({ lowerBinId: "", upperBinId: "" }), {});
    expect(decision.actions).toEqual([]);
    expect(decision.failure?.reason).toContain("range is missing");
    expect(decision.failure?.remedy.length).toBeGreaterThan(0);
  });
});
