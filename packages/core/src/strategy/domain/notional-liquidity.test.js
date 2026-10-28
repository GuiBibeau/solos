// @ts-check
import { describe, expect, test } from "bun:test";
import { compareDecimal } from "./decimal.js";
import { actualUsdFor, reserveUsdFor } from "./notional.js";
import { unsupportedStrategyAction } from "./supported-action.js";

const POOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POSITION = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
const FEE = "0.01";

const priced = {
  priceUsd: "2",
  decimals: 6,
  feeUsd: FEE,
  valueUsd: "10",
  priceB: "1",
  decimalsB: 6,
};

describe("liquidity reservation notional", () => {
  test("a removal counts principal once and a same-tick deposit adds only the fee", () => {
    const remove = {
      type: /** @type {const} */ ("remove_liquidity"),
      protocol: /** @type {const} */ ("meteora"),
      position: POSITION,
      bps: 10_000,
      maxSlippageBps: 50,
    };
    const half = { ...remove, bps: 5000 };
    const close = {
      type: /** @type {const} */ ("close_position"),
      protocol: /** @type {const} */ ("meteora"),
      position: POSITION,
    };
    const open = {
      type: /** @type {const} */ ("open_position"),
      protocol: /** @type {const} */ ("meteora"),
      pool: POOL,
      lowerBinId: 0,
      width: 4,
    };
    const add = {
      type: /** @type {const} */ ("add_liquidity"),
      protocol: /** @type {const} */ ("meteora"),
      pool: POOL,
      position: POSITION,
      amountA: "1000000",
      amountB: "2000000",
      maxSlippageBps: 50,
      wrapSol: false,
    };
    expect(unsupportedStrategyAction("remove_liquidity")).toBeUndefined();
    expect(unsupportedStrategyAction("lend")).toBeDefined();
    expect(compareDecimal(actualUsdFor(remove, priced), "10")).toBe(0);
    expect(compareDecimal(reserveUsdFor(remove, priced), "10.01")).toBe(0);
    expect(compareDecimal(actualUsdFor(half, priced), "5")).toBe(0);
    expect(compareDecimal(actualUsdFor(close, priced), "0")).toBe(0);
    expect(compareDecimal(reserveUsdFor(open, priced), FEE)).toBe(0);
    expect(compareDecimal(actualUsdFor(add, { ...priced, redeposit: true }), "0")).toBe(0);
    expect(compareDecimal(actualUsdFor(add, priced), "4")).toBe(0);
  });
});
