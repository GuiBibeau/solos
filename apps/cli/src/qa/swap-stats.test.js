// @ts-check
import { describe, expect, test } from "bun:test";
import { simulationReason } from "./swap-attempt.js";
import { BONK, SWAP_PAIRS, USDC, WSOL, amountFor } from "./swap-cases.js";
import { SwapQaOptionsSchema, requiredBalance } from "./swap-options.js";
import { percentileMs, summarise, tallyOutcomes } from "./swap-stats.js";
import { heldAmount } from "./swap.js";

/** @param {string} reason @param {number} ms */
const at = (reason, ms) => ({ reason, ms });

describe("swap qa statistics", () => {
  test("percentiles use nearest rank over sorted values", () => {
    const values = [10, 20, 30, 40, 100];
    expect(percentileMs(values, 0.5)).toBe(30);
    expect(percentileMs(values, 0.95)).toBe(100);
    expect(percentileMs(values, 0)).toBe(10);
  });

  test("an empty pair reports zero rather than throwing", () => {
    expect(percentileMs([], 0.5)).toBe(0);
    expect(summarise([])).toMatchObject({ attempts: 0, ok: 0, rate: 0, p50Ms: 0, p95Ms: 0 });
  });

  test("outcomes are ordered most frequent first so the dominant failure reads first", () => {
    const tally = tallyOutcomes([
      at("ok", 1),
      at("SimulationFailed", 1),
      at("SimulationFailed", 1),
      at("BuildRejected", 1),
    ]);
    expect(tally).toEqual([
      { reason: "SimulationFailed", count: 2 },
      { reason: "BuildRejected", count: 1 },
      { reason: "ok", count: 1 },
    ]);
  });

  test("equal counts break by reason, so the report is stable across runs", () => {
    expect(tallyOutcomes([at("zulu", 1), at("alpha", 1)]).map((o) => o.reason)).toEqual([
      "alpha",
      "zulu",
    ]);
  });

  test("the rate counts only ok, and every other outcome is a failure", () => {
    const summary = summarise([at("ok", 100), at("ok", 200), at("SimulationFailed", 300)]);
    expect(summary).toMatchObject({ attempts: 3, ok: 2, p50Ms: 200 });
    expect(summary.rate).toBeCloseTo(2 / 3);
  });
});

describe("swap qa pairs", () => {
  test("a SOL input spends the round size verbatim", () => {
    expect(
      amountFor({ name: "x", inputMint: WSOL, outputMint: BONK, scale: "sol" }, 10_000_000n),
    ).toBe(10_000_000n);
  });

  test("a token input is scaled to a comparable size, in exact base units", () => {
    const amount = amountFor(
      { name: "x", inputMint: USDC, outputMint: WSOL, scale: "usdc" },
      10_000_000n,
    );
    expect(amount).toBe(1_130_000n);
    expect(typeof amount).toBe("bigint");
  });

  test("held amounts read lamports for SOL and the token account otherwise", () => {
    const balances = {
      lamports: "1600000000",
      tokens: [{ mint: USDC, amount: "4447290" }],
    };
    expect(heldAmount(balances, WSOL)).toBe(1_600_000_000n);
    expect(heldAmount(balances, USDC)).toBe(4_447_290n);
    // A mint the wallet has never held is zero, not a crash: the pair is skipped, not failed.
    expect(heldAmount(balances, BONK)).toBe(0n);
  });

  test("every pair covers a distinct market and names itself", () => {
    const names = SWAP_PAIRS.map((pair) => pair.name);
    expect(new Set(names).size).toBe(names.length);
    for (const pair of SWAP_PAIRS) expect(pair.inputMint).not.toBe(pair.outputMint);
  });
});

describe("swap qa guards", () => {
  const base = {
    tier: /** @type {const} */ ("simulate"),
    amountLamports: 10_000_000n,
    slippageBps: 50,
    rounds: 5,
    threshold: 0.9,
  };

  test("an unsatisfiable threshold is refused before anything is sent", () => {
    // The schema used to run only after the sweep, so `--execute --threshold 2` spent real funds
    // and only then reported a validation error.
    expect(() => SwapQaOptionsSchema.parse({ ...base, threshold: 2 })).toThrow();
    expect(() => SwapQaOptionsSchema.parse({ ...base, threshold: 0 })).toThrow();
    expect(() => SwapQaOptionsSchema.parse({ ...base, rounds: 0 })).toThrow();
    expect(() => SwapQaOptionsSchema.parse({ ...base, amountLamports: 0n })).toThrow();
    expect(SwapQaOptionsSchema.parse(base).threshold).toBe(0.9);
  });

  test("an execute sweep must be funded for every round, not just the first", () => {
    expect(requiredBalance(10_000_000n, base)).toBe(10_000_000n);
    expect(requiredBalance(10_000_000n, { ...base, tier: "execute" })).toBe(50_000_000n);
  });

  test("a rejected simulation keeps the chain's own reason", () => {
    const message = 'simulation: "MaxLoadedAccountsDataSizeExceeded"';
    expect(simulationReason({ ok: false, violations: [{ rule: "simulation", message }] })).toBe(
      `SimulationRejected: ${message}`,
    );
    expect(simulationReason({ ok: true })).toBe("ok");
    expect(simulationReason({ ok: false })).toBe("SimulationRejected");
  });

  test("overall percentiles come from every attempt, not from per-pair summaries", () => {
    // Four pairs of five attempts. One extreme value becomes its pair's p95 and so the max of
    // the per-pair p95s, but across all twenty it is the 20th value and the nearest-rank p95 is
    // the 19th. Taking the max of per-pair p95s would report 900 instead of 19.
    const union = [...Array.from({ length: 19 }, (_, i) => i + 1), 900];
    expect(percentileMs(union, 0.95)).toBe(19);
    expect(Math.max(...union)).toBe(900);
    // And the median of the union is its 10th value, not the mean of the per-pair medians.
    expect(percentileMs(union, 0.5)).toBe(10);
  });
});
