// @ts-check
import { describe, expect, test } from "bun:test";
import { AddressSchema } from "./primitives.js";

describe("AddressSchema", () => {
  test("the system program (32 zero bytes) is an address", () => {
    expect(AddressSchema.safeParse("1".repeat(32)).success).toBe(true);
  });

  test("a string decoding to more than 32 bytes is rejected, not left for the RPC to reject", () => {
    // 44 ones are 44 zero bytes: schema-shaped, but WrongSize on the wire.
    expect(AddressSchema.safeParse("1".repeat(44)).success).toBe(false);
  });

  test("a string decoding to fewer than 32 bytes is rejected", () => {
    expect(AddressSchema.safeParse("1".repeat(31)).success).toBe(false);
    expect(AddressSchema.safeParse("2").success).toBe(false);
  });

  test("a real 32-byte mainnet address parses", () => {
    expect(AddressSchema.safeParse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").success).toBe(
      true,
    );
  });

  test("non-base58 characters are rejected", () => {
    expect(AddressSchema.safeParse("0OIl" + "2".repeat(28)).success).toBe(false);
  });

  test("an absurdly long base58-only string is rejected without a decode blowup", () => {
    expect(AddressSchema.safeParse("2".repeat(100_000)).success).toBe(false);
    expect(AddressSchema.safeParse("2".repeat(45)).success).toBe(false);
  });
});
