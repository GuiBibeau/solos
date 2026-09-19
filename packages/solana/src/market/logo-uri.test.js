// @ts-check
import { describe, expect, test } from "bun:test";
import { getAddressEncoder } from "@solana/kit";
import { MAX_LOGO_URI_BYTES, isHttpUrl, logoUriFromPairs } from "./logo-uri.js";
import { tlvRecord, tokenMetadataValue } from "./test-fixtures.js";
import { readTokenMetadataExtension } from "./token-2022-metadata.js";

const MINT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const mintBytes = new Uint8Array(getAddressEncoder().encode(MINT));

/** Metadata record (type 19) for this mint. @param {{ name: string; symbol: string; uri: string; pairs?: ReadonlyArray<readonly [string, string]> }} options */
const metadataRecord = ({ name, symbol, uri, pairs = [] }) =>
  tlvRecord(19, tokenMetadataValue({ mintBytes, name, symbol, uri, pairs }));

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
