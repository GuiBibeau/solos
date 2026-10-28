// @ts-check
import { describe, expect, test } from "bun:test";
import { RangeParamsSchema, StrategyDraftSchema, StrategySchema } from "./index.js";

const POOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POSITION = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const bounds = () => ({
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "1000",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
});

/** @param {Record<string, unknown>} [params] */
const draft = (params = {}) => ({
  owner: "swarm",
  kind: "range",
  params: {
    protocol: "meteora",
    pool: POOL,
    position: POSITION,
    width: 10,
    recenterWhenOutsideFor: 3,
    maxRecentersPerDay: 4,
    ...params,
  },
  tickSource: { type: "clock", every: 60_000 },
  bounds: bounds(),
});

/** @param {unknown} value */
const messages = (value) => {
  const parsed = StrategyDraftSchema.safeParse(value);
  if (parsed.success) return "";
  return parsed.error.issues.map((issue) => issue.message).join(" ");
};

describe("RangeParamsSchema", () => {
  test("accepts a range strategy and defaults slippage", () => {
    const parsed = StrategyDraftSchema.parse(draft());
    expect(parsed.kind).toBe("range");
    expect(parsed.params).toMatchObject({ width: 10, maxSlippageBps: 50, protocol: "meteora" });
    expect(RangeParamsSchema.description?.length).toBeGreaterThan(10);
    const stored = StrategySchema.parse({
      ...draft(),
      schemaVersion: 1,
      id: ID,
      state: "active",
      createdAt: 0,
      expiresAt: null,
    });
    expect(stored.params.position).toBe(POSITION);
  });

  test("rejects a width outside 1..70", () => {
    expect(messages(draft({ width: 0 }))).toContain(">=");
    expect(messages(draft({ width: 71 }))).toContain("70");
    expect(messages(draft({ width: 1.5 }))).toContain("int");
    expect(messages(draft({ maxRecentersPerDay: 25 }))).toContain("24");
  });
});
