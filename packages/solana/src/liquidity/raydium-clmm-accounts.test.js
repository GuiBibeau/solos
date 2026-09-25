// @ts-check
/**
 * The derivations a Raydium liquidity instruction depends on.
 *
 * Two of these have a known-wrong version in circulation — Raydium's own test helper uses a
 * `"protocol_position"` seed prefix and their SDK encodes tick bytes little-endian — so the
 * assertions here are against addresses observed on chain, not against a second copy of our own
 * derivation.
 */
import { describe, expect, test } from "bun:test";
import {
  bitmapExtensionAddress,
  needsBitmapExtension,
  tickArrayAddress,
  tickArrayStartIndex,
} from "./raydium-clmm-accounts.js";

const POOL = "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv";

describe("raydium tick array arithmetic", () => {
  // The case the program's own correction exists for. Plain truncation gives -17580 here, which
  // is a different array and an InvalidTickArray on chain.
  test("a negative tick floors toward negative infinity, not toward zero", () => {
    expect(tickArrayStartIndex(-17_607, 1)).toBe(-17_640);
    expect(tickArrayStartIndex(-16_252, 1)).toBe(-16_260);
    expect(Math.trunc(-17_607 / 60) * 60).toBe(-17_580);
  });

  test("a tick already on a boundary stays on it", () => {
    expect(tickArrayStartIndex(-17_640, 1)).toBe(-17_640);
    expect(tickArrayStartIndex(0, 1)).toBe(0);
    expect(tickArrayStartIndex(60, 1)).toBe(60);
  });

  test("positive ticks need no correction", () => {
    expect(tickArrayStartIndex(17_607, 1)).toBe(17_580);
  });

  test("spacing scales the array span", () => {
    expect(tickArrayStartIndex(-17_607, 60)).toBe(-18_000);
    expect(tickArrayStartIndex(1000, 64)).toBe(0);
    expect(tickArrayStartIndex(3841, 64)).toBe(3840);
  });

  // Verified on chain: position 66o3ki…9EcS spans -21878..-20877 at spacing 1, and both of these
  // arrays exist under the pool with matching start indices.
  test("the derived arrays are the ones the chain has", async () => {
    expect(await tickArrayAddress(POOL, tickArrayStartIndex(-17_607, 1))).toBe(
      "9fznAX9wi4uhKBytKVdQo4fed6ue3UyYYW7qkZZh1kjV",
    );
    expect(await tickArrayAddress(POOL, tickArrayStartIndex(-16_252, 1))).toBe(
      "64HXXxqqxtd8MocvVjBejDGS9hVMTEaVEpYu7MnRiMqk",
    );
  });

  test("a narrow range can land both ticks in one array, which is legal", () => {
    expect(tickArrayStartIndex(-23_373, 1)).toBe(-23_400);
    expect(tickArrayStartIndex(-23_372, 1)).toBe(-23_400);
  });
});

describe("raydium bitmap extension", () => {
  // At spacing 1 the default bitmap covers only +/-30720 ticks, so most of the usable range
  // needs the extension. Getting this wrong is a raw slice-index panic on chain, not an error.
  test("spacing 1 needs the extension beyond 30720 ticks and not within it", () => {
    expect(needsBitmapExtension({ tickLower: -1000, tickUpper: 1000, tickSpacing: 1 })).toBe(false);
    expect(needsBitmapExtension({ tickLower: -40_000, tickUpper: -39_000, tickSpacing: 1 })).toBe(
      true,
    );
    expect(needsBitmapExtension({ tickLower: 1000, tickUpper: 40_000, tickSpacing: 1 })).toBe(true);
  });

  test("wide spacing never needs it, because the default already spans the tick range", () => {
    expect(needsBitmapExtension({ tickLower: -443_000, tickUpper: 443_000, tickSpacing: 60 })).toBe(
      false,
    );
  });

  test("either side crossing the boundary is enough", () => {
    expect(needsBitmapExtension({ tickLower: -40_000, tickUpper: 0, tickSpacing: 1 })).toBe(true);
    expect(needsBitmapExtension({ tickLower: 0, tickUpper: 40_000, tickSpacing: 1 })).toBe(true);
  });

  test("the extension address derives under the pool", async () => {
    expect(await bitmapExtensionAddress(POOL)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
