// @ts-check
import { describe, expect, test } from "bun:test";
import { getAddressEncoder } from "@solana/kit";
import {
  concat,
  prefixedString,
  tlvRecord,
  tokenMetadataValue,
  u16le,
  u32le,
  zeros,
} from "./test-fixtures.js";
import {
  MAX_ADDITIONAL_PAIRS,
  MAX_LOGO_URI_BYTES,
  isHttpUrl,
  logoUriFromPairs,
  readTokenMetadataExtension,
} from "./token-2022-metadata.js";

const MINT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const mintBytes = new Uint8Array(getAddressEncoder().encode(MINT));
const OTHER = new Uint8Array(
  getAddressEncoder().encode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
);

/** Metadata record (type 19) for this mint. @param {{ name: string; symbol: string; uri: string; pairs?: ReadonlyArray<readonly [string, string]> }} options */
const metadataRecord = ({ name, symbol, uri, pairs = [] }) =>
  tlvRecord(19, tokenMetadataValue({ mintBytes, name, symbol, uri, pairs }));

describe("token-2022 TLV walk", () => {
  test("empty extension area means metadata is absent", () => {
    expect(readTokenMetadataExtension(new Uint8Array(0), mintBytes)).toEqual({ status: "absent" });
  });

  test("trailing zero padding stops the walk without an error", () => {
    expect(readTokenMetadataExtension(concat(zeros(4), zeros(8)), mintBytes)).toEqual({
      status: "absent",
    });
  });

  test("a trailing fragment shorter than a header is malformed, per the program", () => {
    expect(readTokenMetadataExtension(new Uint8Array(3), mintBytes)).toMatchObject({
      status: "invalid",
      reason: "extension record header is truncated",
    });
    expect(readTokenMetadataExtension(new Uint8Array(1), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });

  test("unknown extension types are skipped by length", () => {
    const unknownFirst = concat(
      tlvRecord(5, zeros(10)),
      metadataRecord({ name: "Token", symbol: "TKN", uri: "https://x.io" }),
    );
    expect(readTokenMetadataExtension(unknownFirst, mintBytes)).toMatchObject({
      status: "present",
      name: "Token",
      symbol: "TKN",
    });
  });

  test("the walk stops at the type-0 marker even with records behind it", () => {
    const afterMarker = concat(
      u16le(0),
      u16le(4),
      zeros(4),
      metadataRecord({ name: "Token", symbol: "TKN", uri: "" }),
    );
    expect(readTokenMetadataExtension(afterMarker, mintBytes)).toEqual({ status: "absent" });
  });

  test("a record whose length runs past the account end is malformed", () => {
    const lying = concat(u16le(19), u16le(9000), zeros(4));
    expect(readTokenMetadataExtension(lying, mintBytes)).toMatchObject({ status: "invalid" });
  });

  test("metadata pointer with a None target does not block the read", () => {
    const pointer = concat(
      tlvRecord(18, zeros(64)),
      metadataRecord({ name: "Token", symbol: "TKN", uri: "" }),
    );
    expect(readTokenMetadataExtension(pointer, mintBytes)).toMatchObject({
      status: "present",
      name: "Token",
    });
  });

  test("a self-pointing metadata pointer is accepted", () => {
    const pointer = tlvRecord(18, concat(zeros(32), mintBytes));
    expect(
      readTokenMetadataExtension(
        concat(pointer, metadataRecord({ name: "Token", symbol: "TKN", uri: "" })),
        mintBytes,
      ),
    ).toMatchObject({
      status: "present",
    });
  });

  test("a pointer to another account is unsupported and fails, never followed", () => {
    const pointer = tlvRecord(18, concat(zeros(32), OTHER));
    expect(
      readTokenMetadataExtension(
        concat(pointer, metadataRecord({ name: "Token", symbol: "TKN", uri: "" })),
        mintBytes,
      ),
    ).toMatchObject({
      status: "invalid",
      reason: "metadata pointer targets a different account, which solOS does not follow",
    });
  });

  test("a pointer value that is not 64 bytes is malformed", () => {
    expect(readTokenMetadataExtension(tlvRecord(18, zeros(63)), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });
});

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

describe("logoUri from additional metadata", () => {
  test("only a pair keyed exactly `logo` with an http(s) value counts", () => {
    expect(logoUriFromPairs([["logo", "https://a.io/l.png"]])).toBe("https://a.io/l.png");
    expect(logoUriFromPairs([["Logo", "https://a.io/l.png"]])).toBeNull();
    expect(logoUriFromPairs([["logo", "javascript:alert(1)"]])).toBeNull();
    expect(logoUriFromPairs([["logo", "ipfs://bafy..."]])).toBeNull();
    expect(logoUriFromPairs([["website", "https://a.io"]])).toBeNull();
    expect(logoUriFromPairs([])).toBeNull();
  });

  test("a value that merely starts with http(s) but does not parse is skipped, not returned", () => {
    expect(logoUriFromPairs([["logo", "https://"]])).toBeNull();
    expect(logoUriFromPairs([["logo", "http://"]])).toBeNull();
    expect(logoUriFromPairs([["logo", "https://bad host.io/l.png"]])).toBeNull();
  });

  test("a malformed logo pair does not hide a later valid one", () => {
    expect(
      logoUriFromPairs([
        ["logo", "https://"],
        ["logo", "https://a.io/l.png"],
      ]),
    ).toBe("https://a.io/l.png");
  });

  test("a scheme prefix alone is not a well-formed URI", () => {
    expect(logoUriFromPairs([["logo", "https://"]])).toBeNull();
    expect(logoUriFromPairs([["logo", "http://"]])).toBeNull();
  });

  test("a URL the parser rejects leaves logoUri null instead of throwing", () => {
    expect(isHttpUrl("https://a io/l.png")).toBeFalse();
    expect(isHttpUrl("https://a.io:99999/l.png")).toBeFalse();
    expect(logoUriFromPairs([["logo", "https://a io/l.png"]])).toBeNull();
  });

  test("control characters are malformed even when the parser would strip them", () => {
    expect(isHttpUrl("https://a.io/l.png\nx")).toBeFalse();
    expect(isHttpUrl("https://a.io/l.png\t")).toBeFalse();
    expect(isHttpUrl("https://a.io/l.png\r")).toBeFalse();
    expect(logoUriFromPairs([["logo", "https://a.io/l.png\nx"]])).toBeNull();
  });

  test("oversized candidates are malformed, never surfaced", () => {
    const oversized = `https://a.io/${"l".repeat(MAX_LOGO_URI_BYTES)}.png`;
    expect(oversized.length).toBeGreaterThan(MAX_LOGO_URI_BYTES);
    expect(isHttpUrl(oversized)).toBeFalse();
    expect(logoUriFromPairs([["logo", oversized]])).toBeNull();
  });

  test("a malformed logo never poisons the rest of the record", () => {
    const walked = readTokenMetadataExtension(
      metadataRecord({
        name: "Dog Coin",
        symbol: "DOG",
        uri: "https://dog.io/t.json",
        pairs: [
          ["logo", "https://"],
          ["logo", "https://dog.io/l.png"],
        ],
      }),
      mintBytes,
    );
    expect(walked).toMatchObject({ status: "present", name: "Dog Coin" });
    expect(walked.status === "present" && logoUriFromPairs(walked.additionalMetadata)).toBe(
      "https://dog.io/l.png",
    );
  });
});
