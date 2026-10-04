// @ts-check
import { describe, expect, test } from "bun:test";
import { LiquidityRemovalQuoteSchema, SimulationResultSchema } from "@solos-sh/actions";
import { depositQuoteOf } from "./liquidity-deposit-build.js";
import { withdrawQuoteOf } from "./liquidity-withdraw-build.js";

describe("liquidity venue quotes", () => {
  test("the removal mapper publishes the plan as decimal strings", () => {
    const quote = withdrawQuoteOf({
      status: "ok",
      accounts: /** @type {any} */ ({}),
      mintA: "mint-a",
      mintB: "mint-b",
      liquidity: 1_000_000_000_000n,
      estA: 0n,
      estB: 999_535n,
      minA: 0n,
      minB: 995_359n,
    });
    expect(quote).toEqual({
      kind: "removal",
      liquidity: "1000000000000",
      estA: "0",
      estB: "999535",
      minA: "0",
      minB: "995359",
    });
    expect(LiquidityRemovalQuoteSchema.parse(quote)).toEqual(quote);
  });

  test("the deposit mapper publishes required spends and encoded maxima", () => {
    const quote = depositQuoteOf({
      status: "ok",
      accounts: /** @type {any} */ ({}),
      mintA: "mint-a",
      mintB: "mint-b",
      liquidity: 12_345n,
      requiredA: 100n,
      requiredB: 200n,
      tokenMaxA: 105n,
      tokenMaxB: 210n,
    });
    expect(quote).toEqual({
      kind: "deposit",
      liquidity: "12345",
      requiredA: "100",
      requiredB: "200",
      tokenMaxA: "105",
      tokenMaxB: "210",
    });
  });

  test("a simulation result without a venue quote keeps parsing as null", () => {
    const parsed = SimulationResultSchema.parse({
      action: {
        type: "remove_liquidity",
        protocol: "orca",
        position: "2".repeat(44),
        bps: 10_000,
        maxSlippageBps: 50,
      },
      ok: true,
      unitsConsumed: "150",
      logs: [],
      projectedPortfolio: null,
      violations: [],
    });
    expect(parsed.venueQuote).toBe(null);
  });

  test("a removal simulation result carries its venue quote", () => {
    const parsed = SimulationResultSchema.parse({
      action: {
        type: "remove_liquidity",
        protocol: "orca",
        position: "2".repeat(44),
        bps: 10_000,
        maxSlippageBps: 50,
      },
      ok: true,
      unitsConsumed: "150",
      logs: [],
      projectedPortfolio: null,
      venueQuote: {
        kind: "removal",
        liquidity: "1000000000000",
        estA: "0",
        estB: "999535",
        minA: "0",
        minB: "995359",
      },
      violations: [],
    });
    expect(parsed.venueQuote?.kind).toBe("removal");
    expect(parsed.venueQuote?.minB).toBe("995359");
  });
});
