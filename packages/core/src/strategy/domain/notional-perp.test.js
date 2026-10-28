// @ts-check
import { describe, expect, test } from "bun:test";
import { actualUsdFor, reserveUsdFor } from "./notional.js";
import { unsupportedStrategyAction } from "./supported-action.js";

const fee = { priceUsd: "150", decimals: 6, feeUsd: "0.02" };

describe("perp reservation notional", () => {
  test("an open counts the notional and a close counts only the fee", () => {
    const open = {
      type: /** @type {const} */ ("open_perp"),
      protocol: /** @type {const} */ ("phoenix"),
      market: "SOL-PERP",
      side: /** @type {const} */ ("short"),
      traderPdaIndex: /** @type {const} */ (0),
      traderSubaccountIndex: /** @type {const} */ (0),
      notionalUsd: "100000000",
      maxLeverage: 1,
      limitPriceUsd: "149.25",
    };
    const close = {
      type: /** @type {const} */ ("close_perp"),
      protocol: /** @type {const} */ ("phoenix"),
      market: "SOL-PERP",
      traderPdaIndex: /** @type {const} */ (0),
      traderSubaccountIndex: /** @type {const} */ (0),
      limitPriceUsd: "150.75",
    };
    expect(unsupportedStrategyAction("open_perp")).toBeUndefined();
    expect(unsupportedStrategyAction("close_perp")).toBeUndefined();
    expect(actualUsdFor(open, fee)).toBe("100");
    expect(reserveUsdFor(open, fee)).toBe("100.02");
    expect(actualUsdFor(close, fee)).toBe("0");
    expect(reserveUsdFor(close, fee)).toBe("0.02");
  });
});
