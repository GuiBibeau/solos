// @ts-check
import { describe, expect, test } from "bun:test";
import { USDC } from "./action.fixtures.js";
import { BOUNDS_VENUES, EngineBoundsSchema, StrategyBoundsSchema, WSOL_MINT } from "./index.js";

const engine = {
  maxDailySpendUsd: "250",
  allowedMints: /** @type {string[]} */ ([]),
  allowedVenues: /** @type {string[]} */ ([]),
};

const strategy = {
  maxNotionalPerTickUsd: "25",
  maxDailySpendUsd: "100",
  allowedMints: [USDC],
  expiresAt: 1_700_000_000_000,
  maxConsecutiveFailures: 3,
};

describe("Bounds schemas", () => {
  test("parses engine bounds, including a zero cap and empty allowlists", () => {
    expect(EngineBoundsSchema.parse(engine)).toEqual(engine);
    expect(EngineBoundsSchema.parse({ ...engine, maxDailySpendUsd: "0" }).maxDailySpendUsd).toBe(
      "0",
    );
    expect(EngineBoundsSchema.parse({ ...engine, maxDailySpendUsd: "0.50" }).maxDailySpendUsd).toBe(
      "0.50",
    );
  });

  test("parses every venue and a mint allowlist without coercing amounts", () => {
    const bounded = EngineBoundsSchema.parse({
      ...engine,
      allowedMints: [USDC, WSOL_MINT],
      allowedVenues: [...BOUNDS_VENUES],
    });
    expect(bounded.allowedMints).toEqual([USDC, WSOL_MINT]);
    expect(bounded.allowedVenues).toEqual([...BOUNDS_VENUES]);
  });

  test("rejects a numeric, negative or missing daily cap and names the field", () => {
    for (const maxDailySpendUsd of [5, "-1", "-0.1", "250 USD"]) {
      const parsed = EngineBoundsSchema.safeParse({ ...engine, maxDailySpendUsd });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((issue) => issue.path[0] === "maxDailySpendUsd")).toBe(
          true,
        );
      }
    }
    const missing = EngineBoundsSchema.safeParse({
      allowedMints: [],
      allowedVenues: [],
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.some((issue) => issue.path[0] === "maxDailySpendUsd")).toBe(true);
    }
  });

  test("rejects a mint or venue outside the schema and names the allowlist", () => {
    const mint = EngineBoundsSchema.safeParse({ ...engine, allowedMints: ["not-a-mint"] });
    expect(mint.success).toBe(false);
    if (!mint.success) expect(mint.error.issues[0]?.path[0]).toBe("allowedMints");
    const venue = EngineBoundsSchema.safeParse({
      ...engine,
      allowedVenues: ["jupiter", "uniswap"],
    });
    expect(venue.success).toBe(false);
    if (!venue.success) expect(venue.error.issues[0]?.path[0]).toBe("allowedVenues");
  });

  test("parses strategy bounds and rejects a bad tick cap, expiry or failure count", () => {
    expect(StrategyBoundsSchema.parse(strategy)).toEqual(strategy);
    expect(
      StrategyBoundsSchema.parse({ ...strategy, allowedMints: [], maxConsecutiveFailures: 0 })
        .maxConsecutiveFailures,
    ).toBe(0);
    const badCap = StrategyBoundsSchema.safeParse({ ...strategy, maxNotionalPerTickUsd: "-5" });
    expect(badCap.success).toBe(false);
    if (!badCap.success) expect(badCap.error.issues[0]?.path[0]).toBe("maxNotionalPerTickUsd");
    const badExpiry = StrategyBoundsSchema.safeParse({ ...strategy, expiresAt: -1 });
    expect(badExpiry.success).toBe(false);
    if (!badExpiry.success) expect(badExpiry.error.issues[0]?.path[0]).toBe("expiresAt");
    const badFailures = StrategyBoundsSchema.safeParse({
      ...strategy,
      maxConsecutiveFailures: 1.5,
    });
    expect(badFailures.success).toBe(false);
    if (!badFailures.success) {
      expect(badFailures.error.issues[0]?.path[0]).toBe("maxConsecutiveFailures");
    }
  });

  test("describes every field, and says a strategy allowlist never widens the Engine's", () => {
    for (const schema of [EngineBoundsSchema, StrategyBoundsSchema]) {
      for (const [name, field] of Object.entries(schema.shape)) {
        expect(field.description ?? "", name).not.toBe("");
      }
    }
    expect(EngineBoundsSchema.shape.allowedMints.description).toContain("Empty means any");
    expect(EngineBoundsSchema.shape.allowedVenues.description).toContain("Empty means any");
    expect(StrategyBoundsSchema.shape.allowedMints.description).toContain("never widens");
    expect(StrategyBoundsSchema.shape.maxNotionalPerTickUsd.description).toContain("notional");
  });
});
