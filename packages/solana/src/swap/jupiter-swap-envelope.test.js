// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { INPUT_MINT, OUT_AMOUNT, OUTPUT_MINT, okBody } from "./jupiter-swap-bodies.js";
import { quoteFailure, startFixture } from "./jupiter-swap-fixture.js";

/**
 * Envelope rejections on a 200 response: Metis-only quote-only shape, exact request echo,
 * presence of the minimum output and price impact, malformed envelopes, and amounts that are
 * not exact base-unit integers. Missing fields are never fabricated.
 */

describe("JupiterSwapLive envelope rejections [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("maps a 200 with an empty route plan to NoRouteFound", async () => {
    fixture = startFixture([{ body: okBody({ routePlan: [] }) }]);
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "NoRouteFound",
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      provider: "jupiter",
    });
  });

  test("rejects unsupported router, non-ExactIn mode, and executable transaction payloads", async () => {
    fixture = startFixture([
      { body: okBody({ router: "jupiterz" }) },
      { body: okBody({ swapMode: "ExactOut" }) },
      { body: okBody({ transaction: "AmVhc29uYmFzZTY0dHJhbnNhY3Rpb24=" }) },
    ]);
    for (const expected of [
      "router outside the Metis-only restriction",
      "not an ExactIn quote",
      "non-null transaction",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects mint and amount echo mismatches against the exact request", async () => {
    fixture = startFixture([
      { body: okBody({ inputMint: OUTPUT_MINT }) },
      { body: okBody({ outputMint: INPUT_MINT }) },
      { body: okBody({ inAmount: "999" }) },
    ]);
    for (const expected of [
      "mints did not match",
      "mints did not match",
      "inAmount did not match",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects a missing minimum output or price impact instead of fabricating values", async () => {
    const withoutThreshold = okBody();
    delete withoutThreshold.otherAmountThreshold;
    const withoutImpact = okBody();
    delete withoutImpact.priceImpact;
    fixture = startFixture([{ body: withoutThreshold }, { body: withoutImpact }]);
    const thresholdFailure = await quoteFailure(fixture);
    expect(thresholdFailure?._tag).toBe("QuoteResponseInvalid");
    expect(/** @type {{reason: string}} */ (thresholdFailure).reason).toContain(
      "otherAmountThreshold",
    );
    expect((await quoteFailure(fixture))?._tag).toBe("QuoteResponseInvalid");
    expect(fixture.requests).toHaveLength(2);
  });

  test("maps malformed envelopes to QuoteResponseInvalid, one request each", async () => {
    fixture = startFixture([{ body: "not json at all" }, { body: [] }]);
    expect((await quoteFailure(fixture))?._tag).toBe("QuoteResponseInvalid");
    expect((await quoteFailure(fixture))?._tag).toBe("QuoteResponseInvalid");
    expect(fixture.requests).toHaveLength(2);
  });

  test("rejects malformed and inverted output amounts instead of trusting strings", async () => {
    const inverted = (BigInt(OUT_AMOUNT) + 1n).toString();
    fixture = startFixture([
      { body: okBody({ outAmount: "12.5" }) },
      { body: okBody({ otherAmountThreshold: "1.5" }) },
      { body: okBody({ otherAmountThreshold: "-5" }) },
      { body: okBody({ otherAmountThreshold: inverted }) },
    ]);
    for (const expected of [
      "outAmount was not",
      "otherAmountThreshold was not",
      "otherAmountThreshold was not",
      "exceeded the quoted output",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(4);
  });
});
