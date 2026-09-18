// @ts-check
import { describe, expect, test } from "bun:test";
import { USDC_MINT } from "../surfnet/test-surfnet.js";
import { canonicalMint } from "./canonical-mints.js";

const WSOL = "So11111111111111111111111111111111111111112";
/** @param {"spl" | "token-2022"} program @param {number} decimals */
const layout = (program, decimals) => ({
  verdict: /** @type {const} */ ("mint"),
  program,
  decimals,
  extensions: undefined,
});

describe("canonical wSOL/USDC gate", () => {
  test("maps wSOL only for a classic mint with the documented 9 decimals", () => {
    expect(canonicalMint(WSOL, layout("spl", 9))).toEqual({
      name: "Wrapped SOL",
      symbol: "wSOL",
      decimals: 9,
    });
    expect(canonicalMint(WSOL, layout("spl", 6))).toBeNull();
  });

  test("maps USDC only for a classic mint with the documented 6 decimals", () => {
    expect(canonicalMint(USDC_MINT, layout("spl", 6))).toEqual({
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
    });
    expect(canonicalMint(USDC_MINT, layout("spl", 9))).toBeNull();
  });

  test("never maps a token-2022 account, even at the right decimals", () => {
    expect(canonicalMint(WSOL, layout("token-2022", 9))).toBeNull();
  });

  test("unknown mints never map, whatever the layout says", () => {
    expect(
      canonicalMint("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", layout("spl", 9)),
    ).toBeNull();
  });
});
