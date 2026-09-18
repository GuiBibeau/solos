// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  AMOUNT,
  INPUT_MINT,
  MIN_OUT_AMOUNT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  okBody,
  quoteFailure,
  quoteRequest,
  quoteThrough,
  startFixture,
} from "./jupiter-swap-fixture.js";

/**
 * Route-contract regressions for the V2 quote-only response: typed positive hops,
 * requested-pair reachability (order-independent — Metis splits and merges mid-route), and
 * terminal output coverage. No adjacency, allocation, or restart rules exist.
 */

const ALIEN_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const MID_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const FORK_A = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const FORK_B = "mSoLzYCxHdYgdndUvHZ7VfTntVScGvjeFvMmLvpB8ri";

/** Exact output floor at a tolerance, the same BigInt math the validator enforces. */
const thresholdFor = (outAmount, slippageBps) =>
  ((BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();

/**
 * One documented route step; fields default to a consistent single-hop wSOL -> USDC shape.
 * @param {{ from?: string; to?: string; amount?: string; out?: string }} [fields]
 */
const hop = ({ from = INPUT_MINT, to = OUTPUT_MINT, amount = AMOUNT, out = OUT_AMOUNT }) => ({
  swapInfo: {
    ammKey: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    label: "Orca",
    inputMint: from,
    outputMint: to,
    inAmount: amount,
    outAmount: out,
  },
  percent: 100,
  bps: 10_000,
});

describe("JupiterSwapLive route contract [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("rejects malformed route entries and non-positive hop amounts, one request each", async () => {
    const missingAmmKey = okBody();
    delete missingAmmKey.routePlan[0].swapInfo.ammKey;
    const badAmount = okBody();
    badAmount.routePlan[0].swapInfo.inAmount = "12.5";
    const zeroAmount = okBody();
    zeroAmount.routePlan[0].swapInfo.outAmount = "0";
    const missingLabel = okBody();
    delete missingLabel.routePlan[0].swapInfo.label;
    fixture = startFixture([
      { body: missingAmmKey },
      { body: badAmount },
      { body: zeroAmount },
      { body: missingLabel },
    ]);
    for (const expected of [
      "quote envelope",
      "route hop inAmount was not",
      "route hop outAmount was not",
      "quote envelope",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(4);
  });

  test("rejects hops disconnected from the input mint and unreachable outputs", async () => {
    fixture = startFixture([
      // No hop starts from the requested input mint.
      { body: okBody({ routePlan: [hop({ from: OUTPUT_MINT })] }) },
      // The route never produces the requested output mint.
      { body: okBody({ routePlan: [hop({ to: INPUT_MINT })] }) },
      // A second hop fed by a mint nothing produces is alien to the route.
      {
        body: okBody({
          routePlan: [hop({}), hop({ from: ALIEN_MINT })],
        }),
      },
    ]);
    for (const expected of [
      "never reaches the output mint",
      "never reaches the output mint",
      "disconnected from the input mint",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects impossible route outputs whose terminal gross is below the claimed net", async () => {
    const quarter = (BigInt(OUT_AMOUNT) / 4n).toString();
    fixture = startFixture([
      // A single terminal hop producing one unit cannot back the quoted output.
      { body: okBody({ routePlan: [hop({ out: "1" })] }) },
      // Two terminal branches jointly producing half the claimed output.
      {
        body: okBody({
          routePlan: [hop({ out: quarter }), hop({ out: quarter })],
        }),
      },
    ]);
    for (const [index, expected] of ["single", "split"].entries()) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(
        "terminal output was below the quoted output",
      );
      expect(fixture.requests, expected).toHaveLength(index + 1);
    }
  });

  test("accepts an intermediate split and merge across the route", async () => {
    const net = "900000";
    fixture = startFixture([
      {
        body: okBody({
          outAmount: net,
          otherAmountThreshold: thresholdFor(net, 50),
          routePlan: [
            hop({ to: MID_MINT, amount: AMOUNT, out: "2000000" }),
            hop({ from: MID_MINT, to: FORK_A, amount: "2000000", out: "1000000" }),
            hop({ from: MID_MINT, to: FORK_B, amount: "2000000", out: "1000000" }),
            hop({ from: FORK_A, amount: "1000000", out: "500000" }),
            hop({ from: FORK_B, amount: "1000000", out: "500000" }),
          ],
        }),
      },
    ]);
    const quote = await quoteThrough(fixture);
    expect(quote.outAmount).toBe(net);
    expect(quote.minOutAmount).toBe(thresholdFor(net, 50));
    expect(quote.routeSummary).toEqual(["Orca", "Orca", "Orca", "Orca", "Orca"]);
    expect(fixture.requests).toHaveLength(1);
  });

  test("accepts a fee-adjusted output where terminal gross exceeds net, as live", async () => {
    // Live single-hop numbers: gross terminal 1059158, net quoted 1058947 at 50 bps.
    const gross = "1059158";
    const net = "1058947";
    fixture = startFixture([
      {
        body: okBody({
          inAmount: "10000000",
          outAmount: net,
          otherAmountThreshold: thresholdFor(net, 50),
          routePlan: [hop({ amount: "10000000", out: gross })],
        }),
      },
    ]);
    const quote = await quoteThrough(fixture, {}, { ...quoteRequest(), amount: "10000000" });
    expect(quote.outAmount).toBe(net);
    expect(quote.minOutAmount).toBe(thresholdFor(net, 50));
    expect(fixture.requests).toHaveLength(1);
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
});
