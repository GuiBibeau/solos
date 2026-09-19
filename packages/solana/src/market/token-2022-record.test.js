// @ts-check
import { describe, expect, test } from "bun:test";
import { getAddressEncoder } from "@solana/kit";
import {
  concat,
  prefixedString,
  tlvRecord,
  tokenMetadataValue,
  u32le,
  zeros,
} from "./test-fixtures.js";
import { MAX_ADDITIONAL_PAIRS, readTokenMetadataExtension } from "./token-2022-metadata.js";

const MINT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const mintBytes = new Uint8Array(getAddressEncoder().encode(MINT));
const OTHER = new Uint8Array(
  getAddressEncoder().encode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
);

/** Metadata record (type 19) for this mint. @param {{ name: string; symbol: string; uri: string; pairs?: ReadonlyArray<readonly [string, string]> }} options */
const metadataRecord = ({ name, symbol, uri, pairs = [] }) =>
  tlvRecord(19, tokenMetadataValue({ mintBytes, name, symbol, uri, pairs }));

describe("token-2022 TokenMetadata record", () => {
  test("decodes name, symbol, uri and additional pairs", () => {
    const walked = readTokenMetadataExtension(
      metadataRecord({
        name: "Dog Coin",
        symbol: "DOG",
        uri: "https://dog.io/t.json",
        pairs: [["logo", "https://dog.io/l.png"]],
      }),
      mintBytes,
    );
    expect(walked).toEqual({
      status: "present",
      name: "Dog Coin",
      symbol: "DOG",
      uri: "https://dog.io/t.json",
      additionalMetadata: [["logo", "https://dog.io/l.png"]],
    });
  });

  test("trailing NUL padding is trimmed from strings", () => {
    const walked = readTokenMetadataExtension(
      metadataRecord({ name: "Dog Coin\0\0\0", symbol: "DOG\0\0", uri: "" }),
      mintBytes,
    );
    expect(walked).toMatchObject({ name: "Dog Coin", symbol: "DOG" });
  });

  test("metadata claiming a different mint never becomes a ticker", () => {
    const other = tlvRecord(
      19,
      tokenMetadataValue({ mintBytes: OTHER, name: "USDC", symbol: "USDC", uri: "" }),
    );
    expect(readTokenMetadataExtension(other, mintBytes)).toMatchObject({
      status: "invalid",
      reason: "metadata does not belong to the requested mint",
    });
  });

  test("a metadata value shorter than the two 32-byte fields is truncated", () => {
    expect(readTokenMetadataExtension(tlvRecord(19, zeros(63)), mintBytes)).toMatchObject({
      status: "invalid",
      reason: "token metadata value is truncated",
    });
  });

  test("a string length prefix that runs past the value is truncated", () => {
    const value = concat(zeros(32), mintBytes, u32le(50), zeros(3));
    expect(readTokenMetadataExtension(tlvRecord(19, value), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });

  test("a string beyond the decode bound fails before allocation", () => {
    const value = concat(zeros(32), mintBytes, u32le(2000), zeros(32));
    expect(readTokenMetadataExtension(tlvRecord(19, value), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });

  test("a pair count beyond the bound fails before allocation", () => {
    const value = concat(
      zeros(32),
      mintBytes,
      prefixedString("a"),
      prefixedString("b"),
      prefixedString("c"),
      u32le(MAX_ADDITIONAL_PAIRS + 1),
    );
    expect(readTokenMetadataExtension(tlvRecord(19, value), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });

  test("invalid UTF-8 in a string is rejected, not silently replaced", () => {
    const badName = concat(u32le(2), new Uint8Array([255, 254]));
    const value = concat(zeros(32), mintBytes, badName);
    expect(readTokenMetadataExtension(tlvRecord(19, value), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });
});
