// @ts-check
import { describe, expect, test } from "bun:test";
import { address, getAddressEncoder } from "@solana/kit";
import { decodeBondingCurve, isSolQuote } from "./bonding-curve.js";
import { bondingCurveBytes, u64le, zeros } from "./test-fixtures.js";

const addressBytes = getAddressEncoder();
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const usdcBytes = () => new Uint8Array(addressBytes.encode(address(USDC)));

/** Full-layout defaults with distinctive reserves. */
const curve = (overrides = {}) =>
  bondingCurveBytes({
    virtualTokenReserves: 1_073_000_000_000_000n,
    virtualQuoteReserves: 30_000_000_000n,
    realTokenReserves: 793_100_000_000_000n,
    realQuoteReserves: 1_000_000_000n,
    tokenTotalSupply: 1_000_000_000_000_000n,
    ...overrides,
  });

describe("bonding curve decode thresholds", () => {
  test("a full 125-byte account decodes every field", () => {
    const read = decodeBondingCurve(curve({ complete: true }));
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.virtualTokenReserves).toBe(1_073_000_000_000_000n);
    expect(read.layout.virtualQuoteReserves).toBe(30_000_000_000n);
    expect(read.layout.realTokenReserves).toBe(793_100_000_000_000n);
    expect(read.layout.realQuoteReserves).toBe(1_000_000_000n);
    expect(read.layout.complete).toBe(true);
    expect(read.layout.quoteMint).toEqual(zeros(32));
  });

  test("every documented legacy total decodes: 49, 81, 82, 83, 115, 123, 124", () => {
    for (const total of [49, 81, 82, 83, 115, 123, 124]) {
      const read = decodeBondingCurve(curve({ bytes: total }));
      expect(read.status, `legacy total ${total}`).toBe("decoded");
    }
  });

  test("legacy accounts without the quote-mint field default it to absent (SOL-paired)", () => {
    const read = decodeBondingCurve(curve({ bytes: 83 }));
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.quoteMint).toBeUndefined();
    expect(isSolQuote(read.layout.quoteMint)).toBe(true);
  });

  test("a 150-byte padded account decodes identically to its 125-byte body", () => {
    const body = decodeBondingCurve(curve({ complete: true }));
    const padded = decodeBondingCurve(curve({ complete: true, bytes: 150 }));
    expect(padded.status).toBe("decoded");
    expect(body.status).toBe("decoded");
    if (padded.status !== "decoded" || body.status !== "decoded") return;
    expect(padded.layout).toEqual(body.layout);
  });

  test("below the 49-byte legacy minimum the account is truncated, not legacy", () => {
    for (const total of [40, 48]) {
      const read = decodeBondingCurve(curve({ bytes: total }));
      expect(read).toMatchObject({
        status: "corrupt",
        reason: "curve account is truncated below the legacy layout minimum",
      });
    }
  });

  test("a flipped discriminator byte is not a curve", () => {
    const bytes = curve();
    bytes[0] = 24;
    expect(decodeBondingCurve(bytes)).toMatchObject({
      status: "corrupt",
      reason: "curve data does not carry the BondingCurve discriminator",
    });
  });
});

describe("bonding curve u64 round-trips", () => {
  test("extreme u64 values survive the DataView round-trip exactly", () => {
    const read = decodeBondingCurve(
      curve({
        virtualTokenReserves: 18_446_744_073_709_551_615n,
        virtualQuoteReserves: 18_446_744_073_709_551_615n,
        realTokenReserves: 1n,
        realQuoteReserves: 0n,
      }),
    );
    if (read.status !== "decoded") throw new Error("expected a decode");
    expect(read.layout.virtualTokenReserves).toBe(18_446_744_073_709_551_615n);
    expect(read.layout.virtualQuoteReserves).toBe(18_446_744_073_709_551_615n);
    expect(read.layout.realTokenReserves).toBe(1n);
  });

  test("the stored bytes are little-endian u64", () => {
    // 1n encodes as 01 00 00 00 00 00 00 00.
    expect(u64le(1n)).toEqual(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]));
    const read = decodeBondingCurve(curve({ realQuoteReserves: 0x01_02_03_04_05_06_07_08n }));
    if (read.status !== "decoded") throw new Error("expected a decode");
    expect(read.layout.realQuoteReserves).toBe(0x01_02_03_04_05_06_07_08n);
  });
});

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
