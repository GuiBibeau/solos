// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { INPUT_MINT, OUT_AMOUNT, OUTPUT_MINT, okBody, routeHop } from "./jupiter-swap-bodies.js";
import { quoteFailure, startFixture } from "./jupiter-swap-fixture.js";

/**
 * Route-contract rejections for the V2 quote-only response: malformed route entries and
 * non-positive hop amounts, hops disconnected from the requested pair, and impossible outputs
 * whose terminal gross is below the claimed net.
 */

const ALIEN_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

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
      { body: okBody({ routePlan: [routeHop({ from: OUTPUT_MINT })] }) },
      // The route never produces the requested output mint.
      { body: okBody({ routePlan: [routeHop({ to: INPUT_MINT })] }) },
      // A second hop fed by a mint nothing produces is alien to the route.
      {
        body: okBody({
          routePlan: [routeHop({}), routeHop({ from: ALIEN_MINT })],
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
      { body: okBody({ routePlan: [routeHop({ out: "1" })] }) },
      // Two terminal branches jointly producing half the claimed output.
      {
        body: okBody({
          routePlan: [routeHop({ out: quarter }), routeHop({ out: quarter })],
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
});
