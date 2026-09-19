// @ts-check
import { describe, expect, test } from "bun:test";
import { address, getAddressEncoder } from "@solana/kit";
import { decodeBondingCurve, isSolQuote } from "./bonding-curve.js";
import { bondingCurveBytes, zeros } from "./test-fixtures.js";

const addressBytes = getAddressEncoder();
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const usdcBytes = () => new Uint8Array(addressBytes.encode(address(USDC)));

/** A full-layout SOL-paired curve. @param {{ quoteMint?: Uint8Array }} [overrides] */
const curve = (overrides = {}) => bondingCurveBytes({ ...overrides });

describe("SOL-only quote gate", () => {
  test("an absent quote field passes: a legacy account is SOL-paired", () => {
    expect(isSolQuote(undefined)).toBe(true);
  });

  test("an all-zero stored quote mint passes: native SOL is stored as the default pubkey", () => {
    expect(isSolQuote(zeros(32))).toBe(true);
  });

  test("any other stored quote mint fails the gate", () => {
    expect(isSolQuote(usdcBytes())).toBe(false);
  });

  test("the gate sees the account's own quote bytes, not wSOL conventions", () => {
    const read = decodeBondingCurve(curve({ quoteMint: usdcBytes() }));
    if (read.status !== "decoded") throw new Error("expected a decode");
    expect(isSolQuote(read.layout.quoteMint)).toBe(false);
  });
});
