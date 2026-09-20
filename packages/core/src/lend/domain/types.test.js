// @ts-check
import { describe, expect, test } from "bun:test";
import { GetReserveInputSchema, ReserveSnapshotSchema } from "./types.js";

const MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_RESERVE = "KgVfRvAbmrqBsQWChanq2mb9uekPiPQ5vBAXBZfho1a";

const snapshot = {
  protocol: "kamino",
  market: MAIN_MARKET,
  reserve: USDC_RESERVE,
  mint: USDC,
  decimals: 6,
  supplyApy: "0.048",
  borrowApy: "0.091",
  liquidity: "123456",
  at: 1_700_000_000_000,
};

describe("ReserveSnapshotSchema", () => {
  test("accepts a well-formed snapshot", () => {
    expect(ReserveSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  test("accepts zero available liquidity — an existing empty reserve is a success", () => {
    expect(ReserveSnapshotSchema.parse({ ...snapshot, liquidity: "0" }).liquidity).toBe("0");
  });

  test("accepts the u64 maximum liquidity and e-notation APYs verbatim", () => {
    const max = { ...snapshot, liquidity: "18446744073709551615", supplyApy: "5e-7" };
    expect(ReserveSnapshotSchema.parse(max).liquidity).toBe("18446744073709551615");
    expect(ReserveSnapshotSchema.parse(max).supplyApy).toBe("5e-7");
  });

  test("rejects a protocol other than kamino", () => {
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, protocol: "marinade" }).success).toBe(
      false,
    );
  });

  test("rejects decimals outside 0..18", () => {
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, decimals: 19 }).success).toBe(false);
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, decimals: -1 }).success).toBe(false);
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, decimals: 6.5 }).success).toBe(false);
  });

  test("rejects negative, missing-integer, and sign-bearing liquidity strings", () => {
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, liquidity: "-1" }).success).toBe(false);
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, liquidity: "1e6" }).success).toBe(false);
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, liquidity: "007" }).success).toBe(false);
    expect(
      ReserveSnapshotSchema.safeParse({ ...snapshot, liquidity: "18446744073709551616" }).success,
    ).toBe(false);
  });

  test("rejects APYs that are numbers, negative, or malformed decimal strings", () => {
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, supplyApy: 0.05 }).success).toBe(false);
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, borrowApy: "-0.05" }).success).toBe(
      false,
    );
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, supplyApy: ".05" }).success).toBe(false);
  });

  test("rejects identities that are not base58 addresses", () => {
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, market: "not-an-address" }).success).toBe(
      false,
    );
    expect(ReserveSnapshotSchema.safeParse({ ...snapshot, reserve: 42 }).success).toBe(false);
  });

  test("rejects a missing receipt time", () => {
    const withoutAt = { ...snapshot };
    // @ts-expect-error removing the required field under test
    delete withoutAt.at;
    expect(ReserveSnapshotSchema.safeParse(withoutAt).success).toBe(false);
  });
});

describe("GetReserveInputSchema", () => {
  test("accepts a 32-byte base58 mint", () => {
    expect(GetReserveInputSchema.parse({ mint: USDC }).mint).toBe(USDC);
  });

  test("rejects non-address text and addresses that do not decode to 32 bytes", () => {
    expect(GetReserveInputSchema.safeParse({ mint: "not-an-address" }).success).toBe(false);
    expect(GetReserveInputSchema.safeParse({ mint: "1111" }).success).toBe(false);
    expect(GetReserveInputSchema.safeParse({}).success).toBe(false);
  });
});
