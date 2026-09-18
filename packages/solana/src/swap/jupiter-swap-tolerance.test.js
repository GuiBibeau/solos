// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { MIN_OUT_AMOUNT, OUT_AMOUNT, okBody, quoteRequest } from "./jupiter-swap-bodies.js";
import { quoteFailure, quoteThrough, startFixture } from "./jupiter-swap-fixture.js";

/**
 * Slippage-tolerance regressions: the tolerance is a maximum loss, so the echoed threshold must
 * sit between the exact worst case floor(out * (10000 - bps) / 10000) and the output itself.
 */

/** Exact output floor at a tolerance, the same BigInt math the validator enforces. */
const thresholdFor = (outAmount, slippageBps) =>
  ((BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();

describe("JupiterSwapLive slippage tolerance [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("accepts a slippage override whose threshold matches the tolerance exactly", async () => {
    const threshold = thresholdFor(OUT_AMOUNT, 123);
    fixture = startFixture([
      { body: okBody({ slippageBps: 123, otherAmountThreshold: threshold }) },
    ]);
    const quote = await quoteThrough(fixture, {}, { ...quoteRequest(), slippageBps: 123 });
    expect(new URL(fixture.requests[0].url).searchParams.get("slippageBps")).toBe("123");
    expect(quote.minOutAmount).toBe(threshold);
  });

  test("keeps the default and boundary tolerances within the requested protection", async () => {
    fixture = startFixture([
      { body: okBody({ otherAmountThreshold: MIN_OUT_AMOUNT }) },
      { body: okBody({ slippageBps: 0, otherAmountThreshold: OUT_AMOUNT }) },
      { body: okBody({ slippageBps: 10_000, otherAmountThreshold: "0" }) },
    ]);
    expect((await quoteThrough(fixture)).minOutAmount).toBe(MIN_OUT_AMOUNT);
    const atZero = await quoteThrough(fixture, {}, { ...quoteRequest(), slippageBps: 0 });
    expect(atZero.minOutAmount).toBe(OUT_AMOUNT);
    const atFull = await quoteThrough(fixture, {}, { ...quoteRequest(), slippageBps: 10_000 });
    expect(atFull.minOutAmount).toBe("0");
  });

  test("pins the boundary tolerances: zero bps holds the output, full bps allows only zero", async () => {
    fixture = startFixture([
      { body: okBody({ slippageBps: 0, otherAmountThreshold: OUT_AMOUNT }) },
      { body: okBody({ slippageBps: 10_000, otherAmountThreshold: "0" }) },
    ]);
    const atZero = await quoteThrough(fixture, {}, { ...quoteRequest(), slippageBps: 0 });
    expect(atZero.minOutAmount).toBe(OUT_AMOUNT);
    const atFull = await quoteThrough(fixture, {}, { ...quoteRequest(), slippageBps: 10_000 });
    expect(atFull.minOutAmount).toBe("0");
  });

  test("accepts a threshold above the exact worst case as extra protection", async () => {
    const aboveFloor = (BigInt(MIN_OUT_AMOUNT) + 1n).toString();
    fixture = startFixture([{ body: okBody({ otherAmountThreshold: aboveFloor }) }]);
    const quote = await quoteThrough(fixture);
    expect(quote.minOutAmount).toBe(aboveFloor);
    expect(fixture.requests).toHaveLength(1);
  });

  test("rejects a threshold below the exact worst case at 50 bps and at 0 bps", async () => {
    const belowAt50 = (BigInt(MIN_OUT_AMOUNT) - 1n).toString();
    const atZero = (BigInt(OUT_AMOUNT) - 1n).toString();
    fixture = startFixture([
      { body: okBody({ otherAmountThreshold: belowAt50 }) },
      { body: okBody({ slippageBps: 0, otherAmountThreshold: atZero }) },
    ]);
    for (const requested of [50, 0]) {
      const failure = await quoteFailure(
        fixture,
        {},
        { ...quoteRequest(), slippageBps: requested },
      );
      expect(failure?._tag, String(requested)).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, String(requested)).toContain(
        "below the exact worst case",
      );
    }
    expect(fixture.requests).toHaveLength(2);
  });

  test("rejects an echoed slippage that differs from the requested tolerance", async () => {
    fixture = startFixture([
      { body: okBody({ slippageBps: 123, otherAmountThreshold: thresholdFor(OUT_AMOUNT, 123) }) },
    ]);
    const failure = await quoteFailure(fixture);
    expect(failure?._tag).toBe("QuoteResponseInvalid");
    expect(/** @type {{reason: string}} */ (failure).reason).toContain("slippageBps");
  });
});
