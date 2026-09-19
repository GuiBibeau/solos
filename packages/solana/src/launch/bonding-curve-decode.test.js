// @ts-check
import { describe, expect, test } from "bun:test";
import { decodeBondingCurve, LEGACY_MIN_BYTES } from "./bonding-curve.js";
import { bondingCurveBytes } from "./test-fixtures.js";

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

  test("the legacy minimum itself decodes", () => {
    expect(decodeBondingCurve(curve({ bytes: LEGACY_MIN_BYTES })).status).toBe("decoded");
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

describe("bonding curve Borsh boolean validation", () => {
  test("a boolean byte other than 0 or 1 is corrupt at every IDL boolean offset", () => {
    for (const offset of [48, 81, 82, 123, 124]) {
      const bytes = curve();
      bytes[offset] = offset === 48 ? 255 : 2;
      const read = decodeBondingCurve(bytes);
      expect(read.status, `boolean offset ${offset}`).toBe("corrupt");
    }
  });

  test("each invalid boolean names its field and never decodes as truthy", () => {
    const bytes = curve();
    bytes[48] = 255;
    expect(decodeBondingCurve(bytes)).toMatchObject({
      status: "corrupt",
      reason: "curve field complete is a boolean byte that is neither 0 nor 1",
    });
    const trailing = curve();
    trailing[124] = 0x02;
    expect(decodeBondingCurve(trailing)).toMatchObject({
      status: "corrupt",
      reason: "curve field is_holder_reward is a boolean byte that is neither 0 nor 1",
    });
  });

  test("boolean validation respects the length thresholds of the fields", () => {
    // 82 bytes: is_cashback_coin (offset 82, present from 83) does not exist yet.
    const short = curve({ bytes: 82 });
    expect(short.length).toBe(82);
    expect(decodeBondingCurve(short).status).toBe("decoded");
    // One byte longer, that offset now carries a malformed byte.
    const present = curve({ bytes: 83 });
    present[82] = 0x02;
    expect(decodeBondingCurve(present)).toMatchObject({
      status: "corrupt",
      reason: "curve field is_cashback_coin is a boolean byte that is neither 0 nor 1",
    });
  });

  test("valid 0/1 booleans at every offset still decode, including legacy variants", () => {
    const read = decodeBondingCurve(
      curve({
        complete: true,
        isMayhemMode: true,
        isCashbackCoin: true,
        canEditCreatorFee: true,
        isHolderReward: true,
      }),
    );
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.complete).toBe(true);
    const legacy = decodeBondingCurve(curve({ complete: true, bytes: 49 }));
    if (legacy.status !== "decoded") throw new Error("expected a decode");
    expect(legacy.layout.complete).toBe(true);
  });
});
