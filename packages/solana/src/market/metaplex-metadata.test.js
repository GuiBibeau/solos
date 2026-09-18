// @ts-check
import { describe, expect, test } from "bun:test";
import { getAddressEncoder } from "@solana/kit";
import {
  decodeMetaplexMetadata,
  metadataPda,
  MAX_METADATA_ACCOUNT_BYTES,
} from "./metaplex-metadata.js";
import { concat, metaplexV1Bytes, prefixedString, zeros } from "./test-fixtures.js";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const mintBytes = new Uint8Array(getAddressEncoder().encode(MINT));

describe("metaplex metadata decode", () => {
  test("a missing PDA is absent, the common case for tokens without metadata", () => {
    expect(decodeMetaplexMetadata(null, mintBytes)).toEqual({ status: "absent" });
  });

  test("decodes V1 name, symbol, uri and trims legacy NUL padding", () => {
    const decoded = decodeMetaplexMetadata(
      metaplexV1Bytes({
        mintBytes,
        name: "USD Coin\0\0\0\0",
        symbol: "USDC\0\0",
        uri: "https://a.io",
      }),
      mintBytes,
    );
    expect(decoded).toEqual({
      status: "present",
      name: "USD Coin",
      symbol: "USDC",
      uri: "https://a.io",
    });
  });

  test("metadata for another mint never becomes a ticker", () => {
    const other = new Uint8Array(
      getAddressEncoder().encode("So11111111111111111111111111111111111111112"),
    );
    const decoded = decodeMetaplexMetadata(
      metaplexV1Bytes({ mintBytes: other, name: "Wrapped SOL", symbol: "wSOL", uri: "" }),
      mintBytes,
    );
    expect(decoded).toMatchObject({
      status: "invalid",
      reason: "metadata does not belong to the requested mint",
    });
  });

  test("a non-V1 key byte means the account is not readable metadata", () => {
    const decoded = decodeMetaplexMetadata(
      metaplexV1Bytes({ mintBytes, name: "", symbol: "", uri: "", key: 1 }),
      mintBytes,
    );
    expect(decoded).toMatchObject({
      status: "invalid",
      reason: "metadata account is not a MetadataV1",
    });
  });

  test("an account shorter than the V1 prefix is truncated", () => {
    expect(decodeMetaplexMetadata(zeros(64), mintBytes)).toMatchObject({
      status: "invalid",
      reason: "metadata account is truncated",
    });
  });

  test("an account beyond the decode bound fails promptly", () => {
    const huge = concat(
      metaplexV1Bytes({ mintBytes, name: "", symbol: "", uri: "" }),
      zeros(MAX_METADATA_ACCOUNT_BYTES),
    );
    expect(decodeMetaplexMetadata(huge, mintBytes)).toMatchObject({ status: "invalid" });
  });

  test("a string header past the fixed prefix is truncated", () => {
    expect(decodeMetaplexMetadata(concat(zeros(65), zeros(3)), mintBytes)).toMatchObject({
      status: "invalid",
    });
  });

  test("a string beyond the decode bound fails before allocation", () => {
    const oversized = concat(zeros(65), prefixedString("x".repeat(2000)), zeros(16));
    expect(decodeMetaplexMetadata(oversized, mintBytes)).toMatchObject({ status: "invalid" });
  });
});

describe("metadata PDA derivation", () => {
  test("is deterministic, 32 bytes, and distinct per mint", async () => {
    const first = await metadataPda(MINT);
    expect(first).toBe(await metadataPda(MINT));
    expect(first).not.toBe(await metadataPda("So11111111111111111111111111111111111111112"));
    expect(new Uint8Array(getAddressEncoder().encode(first))).toHaveLength(32);
  });
});
