// @ts-check
import { describe, expect, test } from "bun:test";
import { CarryParamsSchema, StrategyDraftSchema, StrategySchema } from "./index.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPOT = "So11111111111111111111111111111111111111112";
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const bounds = () => ({
  maxNotionalPerTickUsd: "1000",
  maxDailySpendUsd: "5000",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
});

/** @param {Record<string, unknown>} [params] */
const draft = (params = {}) => ({
  owner: "swarm",
  kind: "carry",
  params: {
    market: "SOL-PERP",
    spotMint: SPOT,
    notionalUsd: "100",
    entryHurdleAprPct: "12",
    exitHurdleAprPct: "4",
    lookbackHours: 24,
    expectedHoldHours: 24,
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

describe("CarryParamsSchema", () => {
  test("accepts a carry strategy and defaults quote, cost, slippage, and leverage", () => {
    const parsed = StrategyDraftSchema.parse(draft());
    expect(parsed.kind).toBe("carry");
    expect(parsed.params).toMatchObject({
      market: "SOL-PERP",
      quoteMint: USDC,
      roundTripCostPct: "0.3",
      maxSlippageBps: 50,
      maxLeverage: 1,
    });
    expect(CarryParamsSchema.description?.length).toBeGreaterThan(10);
    const stored = StrategySchema.parse({
      ...draft(),
      schemaVersion: 1,
      id: ID,
      state: "active",
      createdAt: 0,
      expiresAt: null,
    });
    expect(stored.params.spotMint).toBe(SPOT);
  });

  test("rejects an exit hurdle that is not strictly below the entry hurdle", () => {
    expect(messages(draft({ exitHurdleAprPct: "12" }))).toContain(
      "exitHurdleAprPct must be strictly less than entryHurdleAprPct",
    );
    expect(messages(draft({ exitHurdleAprPct: "12.0", entryHurdleAprPct: "12" }))).toContain(
      "exitHurdleAprPct must be strictly less than entryHurdleAprPct",
    );
    expect(messages(draft({ exitHurdleAprPct: "13" }))).toContain(
      "exitHurdleAprPct must be strictly less than entryHurdleAprPct",
    );
  });

  test("rejects a non-positive notional, a negative round trip, and a bad window", () => {
    expect(messages(draft({ notionalUsd: "0" }))).toContain("notionalUsd must be positive");
    expect(messages(draft({ notionalUsd: "-1" }))).toContain("notionalUsd must be positive");
    expect(messages(draft({ roundTripCostPct: "-0.1" }))).toContain(
      "roundTripCostPct must be non-negative",
    );
    expect(messages(draft({ lookbackHours: 0 }))).toContain("1");
    expect(messages(draft({ lookbackHours: 169 }))).toContain("168");
    expect(messages(draft({ market: "sol" }))).toContain("pattern");
  });

  test("a non-empty allowlist must name the spot and quote mints", () => {
    expect(messages({ ...draft(), bounds: { ...bounds(), allowedMints: [SPOT] } })).toContain(USDC);
    const named = StrategyDraftSchema.parse({
      ...draft(),
      bounds: { ...bounds(), allowedMints: [SPOT, USDC] },
    });
    expect(named.params.quoteMint).toBe(USDC);
  });
});
