// @ts-check
import { describe, expect, test } from "bun:test";
import { CarryParamsSchema } from "@solos-sh/actions";
import { CARRY_OBSERVATIONS, evaluateCarry } from "./carry-kind.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPOT = "So11111111111111111111111111111111111111112";
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

const params = CarryParamsSchema.parse({
  market: "SOL-PERP",
  spotMint: SPOT,
  notionalUsd: "100",
  entryHurdleAprPct: "10",
  exitHurdleAprPct: "4",
  lookbackHours: 24,
  expectedHoldHours: 24,
  roundTripCostPct: "0",
});

/** @param {Record<string, string | number>} [patch] */
const observed = (patch = {}) => {
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const name of CARRY_OBSERVATIONS) out[name] = 0;
  return {
    ...out,
    instant: NOW,
    currentAprPct: "3",
    markPriceUsd: "150",
    fundingAt: NOW,
    fundingHistory: "[]",
    perpSide: "flat",
    perpSize: "0",
    perpNotionalUsd: "",
    onboarded: 1,
    equityUsd: "1000",
    freeCollateralUsd: "",
    spotBalance: "0",
    spotDecimals: 9,
    quoteBalance: "1000000000",
    quoteDecimals: 6,
    spotPriceUsd: "150",
    quotePriceUsd: "1",
    quoteMint: USDC,
    ...patch,
  };
};

const openCarry = {
  breakEvenAprPct: "0",
  spotAmount: "666666666",
  perpNotionalUsd: "100000000",
  entryAt: NOW - HOUR,
  side: "short",
};

describe("carry evaluate", () => {
  test("no position and funding below the hurdle emits nothing", () => {
    const decision = evaluateCarry(params, observed(), undefined);
    expect(decision.actions).toEqual([]);
    expect(decision.note).toContain("hold");
    expect(decision.note).toContain("trailingMeanAprPct 3");
    expect(decision.note).toContain("entryHurdleAprPct 10");
    expect(decision.note).toContain("breakEvenAprPct 0");
    expect(decision.failure).toBeUndefined();
  });

  test("funding that clears the hurdle and break-even opens short then buys spot", () => {
    const decision = evaluateCarry(params, observed({ currentAprPct: "20" }), undefined);
    expect(decision.actions.map((action) => action.type)).toEqual(["open_perp", "swap"]);
    expect(decision.actions[0]).toMatchObject({
      type: "open_perp",
      protocol: "phoenix",
      market: "SOL-PERP",
      side: "short",
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
      notionalUsd: "100000000",
      maxLeverage: 1,
      limitPriceUsd: "149.25",
    });
    expect(decision.actions[1]).toMatchObject({
      type: "swap",
      inputMint: USDC,
      outputMint: SPOT,
      amount: "100000000",
      maxSlippageBps: 50,
    });
    expect(decision.state).toMatchObject({
      spotAmount: "666666666",
      entryAt: NOW,
      trailingMeanAprPct: "20",
      entryFundingAprPct: "20",
    });
    expect(decision.note).toContain("enter");
  });

  test("funding below the exit hurdle closes the perp then sells the entered spot", () => {
    const decision = evaluateCarry(
      params,
      observed({
        currentAprPct: "1",
        perpSide: "short",
        perpSize: "10",
        spotBalance: "666666666",
      }),
      openCarry,
    );
    expect(decision.actions.map((action) => action.type)).toEqual(["close_perp", "swap"]);
    expect(decision.actions[0]).toMatchObject({
      type: "close_perp",
      protocol: "phoenix",
      limitPriceUsd: "150.75",
    });
    expect(decision.actions[1]).toMatchObject({
      type: "swap",
      inputMint: SPOT,
      outputMint: USDC,
      amount: "666666666",
    });
    expect(decision.note).toContain("exitHurdleAprPct 4");
  });

  test("negative funding exits the same way", () => {
    const decision = evaluateCarry(
      params,
      observed({
        currentAprPct: "-1",
        perpSide: "short",
        perpSize: "10",
        spotBalance: "666666666",
      }),
      openCarry,
    );
    expect(decision.actions.map((action) => action.type)).toEqual(["close_perp", "swap"]);
    expect(decision.actions[1]).toMatchObject({ amount: "666666666" });
    expect(decision.note).toContain("trailingMeanAprPct -1");
  });

  test("a one-hour spike does not lift the trailing mean over the hurdle", () => {
    const spiked = CarryParamsSchema.parse({
      ...params,
      lookbackHours: 4,
      entryHurdleAprPct: "40",
    });
    const history = [3, 2, 1].map((hours) => ({
      at: new Date(NOW - hours * HOUR).toISOString(),
      rateHourlyPct: "0.001",
    }));
    const decision = evaluateCarry(
      spiked,
      observed({ currentAprPct: "80", fundingHistory: JSON.stringify(history) }),
      undefined,
    );
    expect(decision.actions).toEqual([]);
    expect(decision.note.startsWith("hold")).toBe(true);
    expect(decision.state.trailingMeanAprPct).not.toBe("80");
  });

  test("an unonboarded or unfunded trader fails the tick and emits nothing", () => {
    const rich = observed({ currentAprPct: "20" });
    const unonboarded = evaluateCarry(params, { ...rich, onboarded: 0 }, undefined);
    expect(unonboarded.actions).toEqual([]);
    expect(unonboarded.failure?.reason).toBe("trader is not onboarded");
    const unfunded = evaluateCarry(params, { ...rich, equityUsd: "0" }, undefined);
    expect(unfunded.actions).toEqual([]);
    expect(unfunded.failure?.reason).toBe("trader collateral is insufficient");
    const broke = evaluateCarry(params, { ...rich, quoteBalance: "1" }, undefined);
    expect(broke.actions).toEqual([]);
    expect(broke.failure?.reason).toBe("quote balance is insufficient");
  });

  test("a perp short with no spot unwinds and asks the strategy to pause", () => {
    const decision = evaluateCarry(
      params,
      observed({ perpSide: "short", perpSize: "10", spotBalance: "0" }),
      undefined,
    );
    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toMatchObject({ type: "close_perp", protocol: "phoenix" });
    expect(decision.state).toMatchObject({ reason: "unwind", pauseAfter: true });
    expect(decision.note).toContain("unwind");
    const fromState = evaluateCarry(params, observed(), {
      naked: true,
      breakEvenAprPct: "0",
      spotAmount: "0",
    });
    expect(fromState.actions.map((action) => action.type)).toEqual(["close_perp"]);
    expect(fromState.state.pauseAfter).toBe(true);
  });
});
