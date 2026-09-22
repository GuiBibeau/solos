// @ts-check
import { describe, expect, test } from "bun:test";
import { SimulationResultSchema, VenueQuoteSchema } from "./results.js";

describe("venue quotes", () => {
  test("the lend deposit quote carries the exact encoded amount and pre-send evidence", () => {
    const quote = VenueQuoteSchema.parse({
      kind: "lend_deposit",
      reserve: "2".repeat(44),
      obligation: "3".repeat(44),
      liquidityAmount: "1000000",
      estimatedCollateral: "998",
      exchangeRate: "1.0002",
      initializeObligation: true,
      rentLamports: "311472",
      feeLamports: "5000",
    });
    expect(quote.liquidityAmount).toBe("1000000");
    expect(VenueQuoteSchema.safeParse({ ...quote, liquidityAmount: "-1" }).success).toBe(false);
    expect(VenueQuoteSchema.safeParse({ ...quote, initializeObligation: "yes" }).success).toBe(
      false,
    );
  });

  test("a lend simulation result accepts the lend quote and null by default", () => {
    const base = {
      action: {
        type: "lend",
        protocol: "kamino",
        market: "2".repeat(44),
        mint: "3".repeat(44),
        amount: "1",
      },
      ok: true,
      unitsConsumed: "123",
      logs: [],
      projectedPortfolio: null,
      violations: [],
    };
    expect(SimulationResultSchema.safeParse(base).success).toBe(true);
    expect(SimulationResultSchema.parse(base).venueQuote).toBeNull();
    expect(
      SimulationResultSchema.safeParse({
        ...base,
        venueQuote: {
          kind: "lend_deposit",
          reserve: "2".repeat(44),
          obligation: "3".repeat(44),
          liquidityAmount: "1",
          estimatedCollateral: "0",
          exchangeRate: "1",
          initializeObligation: false,
          rentLamports: "0",
          feeLamports: "5000",
        },
      }).success,
    ).toBe(true);
  });
});
