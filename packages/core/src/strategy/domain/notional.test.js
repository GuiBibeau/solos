// @ts-check
import { describe, expect, test } from "bun:test";
import { WSOL_MINT } from "@solos-sh/actions";
import { addDecimal, compareDecimal, subtractDecimal } from "./decimal.js";
import { actualUsdFor, reserveUsdFor } from "./notional.js";
import { usdForLamports } from "./usd-for-lamports.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SWAP_FEE_LAMPORTS = "105000";

/** @param {string} amount @param {number} maxSlippageBps */
const swap = (amount, maxSlippageBps) => ({
  type: /** @type {const} */ ("swap"),
  inputMint: WSOL_MINT,
  outputMint: USDC,
  amount,
  maxSlippageBps,
});

describe("reservation notional", () => {
  test("a swap hold is the input at max slippage plus the built fee", () => {
    const action = swap("10000000", 50);
    const price = "100";
    const priced = { priceUsd: price, decimals: 9 };
    const input = actualUsdFor(action, priced);
    const feeUsd = usdForLamports(SWAP_FEE_LAMPORTS, price);
    const slipped = reserveUsdFor(action, { ...priced, feeUsd: "0" });
    const hold = reserveUsdFor(action, { ...priced, feeUsd: feeUsd ?? "0" });
    expect(input).toBe("1.00000000");
    expect(feeUsd).toBe("0.0105");
    expect(slipped).toBe("1.00500000");
    expect(hold).toBe(addDecimal(slipped, feeUsd ?? "0"));
    const slippageGap = subtractDecimal(slipped, input);
    expect(
      compareDecimal(subtractDecimal(hold, input), addDecimal(slippageGap, feeUsd ?? "0")),
    ).toBe(0);
    expect(compareDecimal(hold, addDecimal(input, "0.50")) < 0).toBe(true);
  });
});
