// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  AMOUNT,
  INPUT_MINT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  okBody,
  quoteFailure,
  startFixture,
} from "./jupiter-swap-fixture.js";

/**
 * Route-contract regressions for the V2 quote-only response: route steps must carry the
 * documented fields and form a usable, fully-allocated route.
 */

/**
 * One documented route step; fields default to a consistent single-hop wSOL -> USDC shape.
 * @param {{ from?: string; to?: string; bps?: number; amount?: string; out?: string }} [fields]
 */
const hop = ({
  from = INPUT_MINT,
  to = OUTPUT_MINT,
  bps = 10_000,
  amount = AMOUNT,
  out = OUT_AMOUNT,
}) => ({
  swapInfo: {
    ammKey: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    label: "Orca",
    inputMint: from,
    outputMint: to,
    inAmount: amount,
    outAmount: out,
  },
  percent: bps / 100,
  bps,
});

describe("JupiterSwapLive route contract [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("rejects malformed route entries, one request each", async () => {
    const missingAmmKey = okBody();
    delete missingAmmKey.routePlan[0].swapInfo.ammKey;
    const badAmount = okBody();
    badAmount.routePlan[0].swapInfo.inAmount = "12.5";
    const zeroAmount = okBody();
    zeroAmount.routePlan[0].swapInfo.outAmount = "0";
    fixture = startFixture([{ body: missingAmmKey }, { body: badAmount }, { body: zeroAmount }]);
    for (const expected of [
      "quote envelope",
      "route hop inAmount was not",
      "route hop outAmount was not",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects routes that do not span the requested pair or cover the swap", async () => {
    const quarter = (BigInt(AMOUNT) / 4n).toString();
    fixture = startFixture([
      // Route starts at the wrong mint.
      { body: okBody({ routePlan: [hop({ from: OUTPUT_MINT })] }) },
      // Route ends at the wrong mint.
      { body: okBody({ routePlan: [hop({ to: INPUT_MINT })] }) },
      // Split branches consume only half of the input.
      {
        body: okBody({
          routePlan: [hop({ bps: 5000, amount: quarter }), hop({ bps: 5000, amount: quarter })],
        }),
      },
    ]);
    for (const expected of [
      "did not start from the input mint",
      "did not end at the output mint",
      "did not consume the whole quoted input",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects inconsistent allocations and broken hop chaining, one request each", async () => {
    const half = (BigInt(AMOUNT) / 2n).toString();
    fixture = startFixture([
      // Split allocations of 5000 + 4999 bps leave the swap partly unallocated.
      {
        body: okBody({
          routePlan: [hop({ bps: 5000, amount: half }), hop({ bps: 4999, amount: half })],
        }),
      },
      // Sequential hops whose mints do not chain.
      {
        body: okBody({
          routePlan: [hop({ out: AMOUNT }), hop({ from: INPUT_MINT, out: OUT_AMOUNT })],
        }),
      },
      // Sequential hops whose amounts do not chain.
      {
        body: okBody({
          routePlan: [hop({ out: "1" }), hop({ from: OUTPUT_MINT, amount: "2", out: OUT_AMOUNT })],
        }),
      },
      // A new split branch that does not restart from the input mint.
      {
        body: okBody({
          routePlan: [
            hop({ bps: 5000, amount: half }),
            hop({ bps: 5000, amount: half, from: OUTPUT_MINT }),
          ],
        }),
      },
    ]);
    for (const expected of [
      "allocations did not cover the whole swap",
      "did not chain mint to mint",
      "did not chain amount to amount",
      "did not start from the input mint",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(4);
  });
});
