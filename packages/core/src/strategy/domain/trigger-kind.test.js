// @ts-check
import { describe, expect, test } from "bun:test";
import { plainDecimal } from "./decimal.js";
import { evaluateTrigger, persistedState } from "./trigger-kind.js";
import { latestPersistedState } from "./trigger-state.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ACTION = { type: /** @type {const} */ ("transfer_sol"), to: USDC, lamports: "1" };
const NOW = 1_700_000_000_000;
const TEN_MINUTES = 600_000;

/** @param {Record<string, unknown>} patch */
const params = (patch) =>
  /** @type {import("@solos-sh/actions").TriggerParams} */ ({
    observe: { price: USDC },
    condition: "below",
    action: ACTION,
    once: true,
    ...patch,
  });

/**
 * @param {string | undefined} price
 * @param {Record<string, string | number>} [extra]
 */
const seen = (price, extra = {}) => ({
  ...(price !== undefined && { price }),
  priceAt: NOW,
  instant: NOW,
  stalenessMs: 120_000,
  ...extra,
});

describe("evaluateTrigger", () => {
  test("fixed lines, trailing stops, trailing entries, stale prices, cooldown, and re-arm", () => {
    const below = params({ priceUsd: "150" });
    const above = params({ condition: "above", priceUsd: "170" });
    expect(evaluateTrigger(below, seen("160"), {}).actions).toEqual([]);
    expect(evaluateTrigger(below, seen("150"), {}).actions).toEqual([]);
    expect(evaluateTrigger(below, seen("149"), {}).actions).toEqual([ACTION]);
    expect(evaluateTrigger(above, seen("160"), {}).actions).toEqual([]);
    expect(evaluateTrigger(above, seen("170"), {}).actions).toEqual([]);
    expect(evaluateTrigger(above, seen("171"), {}).actions).toEqual([ACTION]);

    const stop = params({ trailingBps: 500 });
    let state = evaluateTrigger(stop, seen("160"), {}).state;
    expect(state).toEqual({ bestPriceUsd: "160" });
    state = evaluateTrigger(stop, seen("170"), state).state;
    expect(state).toEqual({ bestPriceUsd: "170" });
    state = evaluateTrigger(stop, seen("180"), state).state;
    expect(state).toEqual({ bestPriceUsd: "180" });
    const inside = evaluateTrigger(stop, seen("172"), state);
    expect(inside.actions).toEqual([]);
    expect(inside.state.bestPriceUsd).toBe("180");
    const fired = evaluateTrigger(stop, seen("171"), state);
    expect(fired.actions).toEqual([ACTION]);
    expect(fired.state).toEqual({ bestPriceUsd: "171", firedAt: NOW });
    expect(persistedState(fired, "failed")).toEqual({ bestPriceUsd: "180" });
    expect(persistedState(fired, "executed")).toEqual(fired.state);

    const entry = params({ condition: "above", trailingBps: 300 });
    state = evaluateTrigger(entry, seen("110"), {}).state;
    state = evaluateTrigger(entry, seen("100"), state).state;
    expect(state.bestPriceUsd).toBe("100");
    expect(evaluateTrigger(entry, seen("102"), state).actions).toEqual([]);
    expect(evaluateTrigger(entry, seen("103"), state).actions).toEqual([ACTION]);

    const stale = evaluateTrigger(stop, seen("171", { priceAt: NOW - 120_001 }), {
      bestPriceUsd: "180",
    });
    expect(stale.actions).toEqual([]);
    expect(stale.skip?.reason).toContain("older than the staleness limit");
    expect(stale.state.bestPriceUsd).toBe("180");
    expect(
      evaluateTrigger(stop, seen("171", { priceAt: NOW - 120_000 }), state).skip,
    ).toBeUndefined();

    const missing = evaluateTrigger(below, seen(undefined), { bestPriceUsd: "160" });
    expect(missing.skip?.reason).toContain("missing");
    expect(missing.state.bestPriceUsd).toBe("160");

    const cooling = params({ priceUsd: "150", once: false, cooldown: TEN_MINUTES });
    const armed = { bestPriceUsd: "171", firedAt: NOW };
    const waiting = evaluateTrigger(
      cooling,
      seen("149", { instant: NOW + TEN_MINUTES - 1, priceAt: NOW + TEN_MINUTES - 1 }),
      armed,
    );
    expect(waiting.actions).toEqual([]);
    expect(waiting.note).toContain("cooling down");
    expect(waiting.state).toEqual(armed);
    const again = evaluateTrigger(
      cooling,
      seen("149", { instant: NOW + TEN_MINUTES, priceAt: NOW + TEN_MINUTES }),
      armed,
    );
    expect(again.actions).toEqual([ACTION]);
    expect(again.state.firedAt).toBe(NOW + TEN_MINUTES);
  });

  test("scientific notation is a plain decimal before the comparison", () => {
    expect(plainDecimal("1e-7")).toBe("0.0000001");
    expect(plainDecimal("1.25e-8")).toBe("0.0000000125");
    const dust = params({ condition: "below", priceUsd: "0.0000002" });
    expect(evaluateTrigger(dust, seen("1e-7"), {}).actions).toEqual([ACTION]);
    expect(evaluateTrigger(dust, seen("2e-7"), {}).actions).toEqual([]);
    const hidden = { bestPriceUsd: "180", firedAt: NOW };
    expect(latestPersistedState([{}, { state: hidden }])).toEqual(hidden);
  });
});
