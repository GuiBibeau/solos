// @ts-check
import { describe, expect, test } from "bun:test";
import { getAddressEncoder } from "@solana/kit";
import { concat, tlvRecord, tokenMetadataValue, u16le, zeros } from "./test-fixtures.js";
import { readTokenMetadataExtension } from "./token-2022-metadata.js";

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

  test("a permitted one-byte realloc tail ends the walk, whatever its value", () => {
    expect(readTokenMetadataExtension(new Uint8Array([0]), mintBytes)).toEqual({
      status: "absent",
    });
    expect(readTokenMetadataExtension(new Uint8Array([255]), mintBytes)).toEqual({
      status: "absent",
    });
  });

  test("a permitted two-byte type-zero end marker ends the walk (multisig padding tail)", () => {
    expect(readTokenMetadataExtension(new Uint8Array([0, 0]), mintBytes)).toEqual({
      status: "absent",
    });
    // The tail is also a clean end after a real record the walk skips.
    const skipped = concat(tlvRecord(5, zeros(10)), new Uint8Array([0, 0]));
    expect(readTokenMetadataExtension(skipped, mintBytes)).toEqual({ status: "absent" });
  });

  test("a three-byte tail with a nonzero type half-header is still malformed", () => {
    // A half-header: two type bytes with nonzero type, one byte short of a full record header.
    expect(readTokenMetadataExtension(new Uint8Array([18, 52, 0]), mintBytes)).toMatchObject({
      status: "invalid",
      reason: "extension record header is truncated",
    });
  });

  test("a truncated initialized record is rejected; permitted tails do not cover it", () => {
    expect(readTokenMetadataExtension(new Uint8Array([19, 0, 0]), mintBytes)).toMatchObject({
      status: "invalid",
      reason: "extension record header is truncated",
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
