// @ts-check
import { describe, expect, test } from "bun:test";
import { actualUsdFor, reserveUsdFor } from "./notional.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("reservation notional", () => {
  test("a transfer reserves the input notional plus the fee buffer", () => {
    const action = { type: "transfer_sol", to: USDC, lamports: "10000000" };
    expect(actualUsdFor(action, "150")).toBe("1.50000000");
    expect(reserveUsdFor(action, "150")).toBe("2.00000000");
  });
});
