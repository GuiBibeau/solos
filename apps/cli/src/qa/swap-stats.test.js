// @ts-check
import { describe, expect, test } from "bun:test";
import { BONK, SWAP_PAIRS, USDC, WSOL, amountFor } from "./swap-cases.js";
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
