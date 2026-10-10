// @ts-check
import { describe, expect, test } from "bun:test";
import { BoundsExceeded } from "./engine-errors.js";
import { errorEnvelope } from "./error-envelope.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";

describe("BoundsExceeded", () => {
  test("a raised daily cap names the bound, the limit, the request, and the scope", () => {
    const props = {
      bound: "maxDailySpendUsd",
      limit: "5",
      requested: "3",
      scope: "engine",
      reason: "daily spend cap is 5 USD and this action requests 3 USD",
      remedy: "lower the amount, wait for the next UTC day, or raise maxDailySpendUsd",
    };
    const raise = () => {
      throw new BoundsExceeded(props);
    };
    expect(raise).toThrow(BoundsExceeded);
    try {
      raise();
    } catch (error) {
      expect(error).toBeInstanceOf(BoundsExceeded);
      expect(/** @type {BoundsExceeded} */ (error)._tag).toBe("BoundsExceeded");
      expect(errorEnvelope(error)).toEqual({ code: "BoundsExceeded", ...props });
    }
  });

  test("a raised allowlist refusal names the mint a Strategy tried to add", () => {
    const props = {
      bound: "allowedMints",
      limit: USDC,
      requested: WSOL,
      scope: "strategy",
      reason: `mint ${WSOL} is outside the Engine allowlist`,
      remedy: "drop that mint from the Strategy allowlist",
    };
    expect(() => {
      throw new BoundsExceeded(props);
    }).toThrow(BoundsExceeded);
    let caught;
    try {
      throw new BoundsExceeded(props);
    } catch (error) {
      caught = errorEnvelope(error);
    }
    expect(caught).toEqual({ code: "BoundsExceeded", ...props });
  });
});
