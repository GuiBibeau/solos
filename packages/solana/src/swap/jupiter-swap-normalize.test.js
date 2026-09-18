// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  AMOUNT,
  INPUT_MINT,
  MIN_OUT_AMOUNT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  okBody,
} from "./jupiter-swap-bodies.js";
import { quoteThrough, startFixture } from "./jupiter-swap-fixture.js";
import { QUOTE_TTL_MS } from "./jupiter-swap-quote.js";

/**
 * Normalization of a validated V2 envelope onto the SwapQuote contract: verbatim amounts,
 * the priceImpact ratio, the local 30-second expiry, and the raw strip-mode payload.
 */

describe("JupiterSwapLive quote normalization [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("normalizes the V2 envelope onto the SwapQuote contract", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.provider).toBe("jupiter");
    expect(quote.inputMint).toBe(INPUT_MINT);
    expect(quote.outputMint).toBe(OUTPUT_MINT);
    expect(quote.inAmount).toBe(AMOUNT);
    expect(quote.outAmount).toBe(OUT_AMOUNT);
    expect(quote.minOutAmount).toBe(MIN_OUT_AMOUNT);
    expect(quote.priceImpactPct).toBe("0.01");
    expect(quote.routeSummary).toEqual(["Orca"]);
  });

  test("one priceImpact percentage point normalizes to the legacy decimal ratio 0.01", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.priceImpactPct).toBe(String(1 / 100));
    expect(quote.priceImpactPct).toBe("0.01");
  });

  test("the live-probed percentage-point value reproduces the provider's own ratio string", async () => {
    const priceImpact = -0.023645774568875608;
    fixture = startFixture([
      { body: okBody({ priceImpact, priceImpactPct: String(priceImpact / 100) }) },
    ]);
    const quote = await quoteThrough(fixture);
    expect(quote.priceImpactPct).toBe("-0.00023645774568875608");
  });

  test("expiresAt is the local receipt time plus the documented 30-second local TTL", async () => {
    expect(QUOTE_TTL_MS).toBe(30_000);
    fixture = startFixture([{ body: okBody() }]);
    const before = Date.now();
    const quote = await quoteThrough(fixture);
    expect(quote.expiresAt).toBeGreaterThanOrEqual(before + QUOTE_TTL_MS);
    expect(quote.expiresAt).toBeLessThanOrEqual(Date.now() + QUOTE_TTL_MS);
  });

  test("raw is the validated provider payload, non-executable with the route retained", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.raw).toMatchObject({
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      inAmount: AMOUNT,
      outAmount: OUT_AMOUNT,
      otherAmountThreshold: MIN_OUT_AMOUNT,
      swapMode: "ExactIn",
      router: "metis",
      transaction: null,
      routePlan: [
        {
          swapInfo: {
            ammKey: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
            label: "Orca",
            inputMint: INPUT_MINT,
            outputMint: OUTPUT_MINT,
            inAmount: AMOUNT,
            outAmount: OUT_AMOUNT,
          },
          percent: 100,
          bps: 10_000,
        },
      ],
    });
    const rendered = JSON.stringify(quote.raw);
    // Undocumented extras are tolerated on the wire but stripped from the validated payload.
    expect(rendered.includes("guaranteedPrice")).toBe(false);
    expect(rendered.includes("jitOptimized")).toBe(false);
  });
});
