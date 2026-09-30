// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { OUT_AMOUNT, OUTPUT_MINT, okBody, routeHop } from "./jupiter-swap-bodies.js";
import { quoteFailure, startFixture } from "./jupiter-swap-fixture.js";

const ALIEN_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

/**
 * Terminal coverage is net flow in the output mint. A route that produces the quoted output,
 * spends it again on a detour, and comes back with a sliver leaves the taker the sliver, however
 * large the gross production looks.
 */
describe("JupiterSwapLive terminal coverage counts net output [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("a pass-through hop cannot satisfy the quoted output", async () => {
    fixture = startFixture([
      {
        body: okBody({
          routePlan: [
            routeHop({ to: OUTPUT_MINT, out: OUT_AMOUNT }),
            routeHop({ from: OUTPUT_MINT, to: ALIEN_MINT, amount: OUT_AMOUNT, out: "5" }),
            routeHop({ from: ALIEN_MINT, to: OUTPUT_MINT, amount: "5", out: "1" }),
          ],
        }),
      },
    ]);
    const failure = await quoteFailure(fixture);
    expect(failure?._tag).toBe("QuoteResponseInvalid");
    expect(/** @type {{ reason: string }} */ (failure).reason).toContain(
      "route terminal output was below the quoted output",
    );
    expect(fixture.requests).toHaveLength(1);
  });
});
