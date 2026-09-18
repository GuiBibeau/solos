// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { AMOUNT, okBody, quoteRequest, routeHop } from "./jupiter-swap-bodies.js";
import { quoteThrough, startFixture } from "./jupiter-swap-fixture.js";

/**
 * Mid-route topology acceptance: Metis may split an intermediate mint across branches and
 * merge them again, and fees may make the terminal gross exceed the quoted net output. No
 * adjacency, allocation, or restart rules exist.
 */

const MID_MINT = "7xLkLgPycwFJnLo9vCuhAuJVHwvAgB4kiOQmZAwKSo6U";
const FORK_A = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const FORK_B = "mSoLzYCxHdYgdndUvHZ7VfTntVScGvjeFvMmLvpB8ri";

/** Exact output floor at a tolerance, the same BigInt math the validator enforces. */
const thresholdFor = (outAmount, slippageBps) =>
  ((BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();

describe("JupiterSwapLive route topology [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("accepts an intermediate split and merge across the route", async () => {
    const net = "900000";
    fixture = startFixture([
      {
        body: okBody({
          outAmount: net,
          otherAmountThreshold: thresholdFor(net, 50),
          routePlan: [
            // The only producer of the intermediate mint; not itself a terminal hop.
            routeHop({ to: MID_MINT, amount: AMOUNT, out: "2000000" }),
            // The produced 2,000,000 splits 60/40 across two AMMs...
            routeHop({ from: MID_MINT, to: FORK_A, amount: "1200000", out: "700000", bps: 6000 }),
            routeHop({ from: MID_MINT, to: FORK_B, amount: "800000", out: "550000", bps: 4000 }),
            // ...and each branch passes its whole output on towards the requested mint.
            routeHop({ from: FORK_A, amount: "700000", out: "500000" }),
            routeHop({ from: FORK_B, amount: "550000", out: "500000" }),
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
          routePlan: [routeHop({ amount: "10000000", out: gross })],
        }),
      },
    ]);
    const quote = await quoteThrough(fixture, {}, { ...quoteRequest(), amount: "10000000" });
    expect(quote.outAmount).toBe(net);
    expect(quote.minOutAmount).toBe(thresholdFor(net, 50));
    expect(fixture.requests).toHaveLength(1);
  });
});
