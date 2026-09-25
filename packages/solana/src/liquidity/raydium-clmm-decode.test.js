// @ts-check
/**
 * The Raydium layouts, pinned against **real mainnet bytes** rather than fixtures we wrote.
 *
 * That matters more here than it does for Orca. There is no versioned artifact to pin to — no
 * git tags, no releases, a placeholder IDL version and no on-chain IDL account — so a fixture
 * built from our own reading of the offsets would agree with the decoder by construction and
 * prove nothing. The prefix below was read from mainnet pool
 * `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` on 2026-09-25; if an offset is wrong, these
 * decode to nonsense.
 */
import { describe, expect, test } from "bun:test";
import { decodePersonalPosition, decodePoolState } from "./raydium-clmm-decode.js";
import {
  PERSONAL_POSITION_BYTES,
  PERSONAL_POSITION_DISCRIMINATOR,
} from "./raydium-clmm-program.js";

/** The first 273 bytes of a live SOL/USDC PoolState — everything the read touches. */
const LIVE_POOL_PREFIX =
  "9+3j9dfD3kb/J/h1kZHXDyshRTJ1cBKA+75w9IwihSFNbCJrm2AsTU2n4L9mLmKyVEpBQSbsZYZslSyLgLfqrjxPjwNPsqt58" +
  "AabiFf+q4GE+2h/Y0YYwDXaxDncGus7VZig8AAAAAABxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWE1xC8EegCgoA" +
  "4uXlAv1Mq8Ujt5easRI0mT0Kd5/M0SaUYpXTwujyqOjii0GtMaFsBn/mlkafyZcZXVyvv1WhbIJa4wmFjRjYV3XU2tkbL5lj4" +
  "9adulPU/iZbZpnkdbsRkJBgEA5v4fOEZoAAAAAAAAAAAAAFZOE7yzZLBYAAAAAAAAAAAurf//";

const livePool = () => Uint8Array.from(Buffer.from(LIVE_POOL_PREFIX, "base64"));

/** A position account built from the pinned layout, for the fields the live pool cannot supply. */
const positionBytes = ({
  tickLower = -17_607,
  tickUpper = -16_252,
  liquidity = 10n ** 12n,
} = {}) => {
  const bytes = new Uint8Array(PERSONAL_POSITION_BYTES);
  bytes.set(PERSONAL_POSITION_DISCRIMINATOR, 0);
  const view = new DataView(bytes.buffer);
  bytes.set(new Uint8Array(32).fill(3), 9); // nft_mint
  bytes.set(new Uint8Array(32).fill(4), 41); // pool_id
  view.setInt32(73, tickLower, true);
  view.setInt32(77, tickUpper, true);
  view.setBigUint64(81, BigInt.asUintN(64, liquidity), true);
  view.setBigUint64(89, liquidity >> 64n, true);
  return bytes;
};

describe("raydium clmm decode", () => {
  test("a live mainnet pool decodes to the pair it actually is", () => {
    const read = decodePoolState(livePool());
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.tokenMint0).toBe("So11111111111111111111111111111111111111112");
    expect(read.layout.tokenMint1).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(read.layout.decimals0).toBe(9);
    expect(read.layout.decimals1).toBe(6);
    expect(read.layout.tickSpacing).toBe(1);
  });

  // The strongest check available without a second implementation. `tick_current` and
  // `sqrt_price_x64` are different fields at different offsets, and the program keeps them in a
  // fixed relationship: the tick is the floor, so the sqrt price sits in [tick, tick+1). A wrong
  // offset on either breaks that. Asserting equality would be wrong — they differ by up to one
  // tick by design, which is what the first version of this test got wrong.
  test("the decoded sqrt price falls inside the decoded tick's own bracket", () => {
    const read = decodePoolState(livePool());
    if (read.status !== "decoded") throw new Error("expected a decode");
    const fromSqrt = Number(read.layout.sqrtPrice) / 2 ** 64;
    const atTick = Math.sqrt(1.0001 ** read.layout.tickCurrent);
    const atNextTick = Math.sqrt(1.0001 ** (read.layout.tickCurrent + 1));
    expect(fromSqrt).toBeGreaterThanOrEqual(atTick);
    expect(fromSqrt).toBeLessThan(atNextTick);
  });

  test("a pool shorter than the fields the read touches is corrupt, not partially decoded", () => {
    expect(decodePoolState(livePool().slice(0, 272)).status).toBe("corrupt");
  });

  test("a pool without the PoolState discriminator is refused", () => {
    const bytes = livePool();
    bytes[0] = 0;
    expect(decodePoolState(bytes)).toMatchObject({ status: "corrupt" });
  });

  test("an absent account is its own corrupt reason, never a zero position", () => {
    expect(decodePoolState(null)).toMatchObject({ status: "corrupt" });
    expect(decodePersonalPosition(null)).toMatchObject({ status: "corrupt" });
  });

  test("a position decodes its range and u128 liquidity", () => {
    const read = decodePersonalPosition(positionBytes());
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.tickLowerIndex).toBe(-17_607);
    expect(read.layout.tickUpperIndex).toBe(-16_252);
    expect(read.layout.liquidity).toBe(10n ** 12n);
  });

  test("liquidity survives the full u128 range", () => {
    const max = (1n << 128n) - 1n;
    const read = decodePersonalPosition(positionBytes({ liquidity: max }));
    expect(read.status === "decoded" && read.layout.liquidity).toBe(max);
  });

  test("the wrong size is refused before any field is read", () => {
    expect(decodePersonalPosition(positionBytes().slice(0, 280))).toMatchObject({
      status: "corrupt",
      reason: "position account has the wrong layout",
    });
  });

  test("an inverted or out-of-bounds range cannot become a position", () => {
    expect(decodePersonalPosition(positionBytes({ tickLower: 10, tickUpper: 10 }))).toMatchObject({
      status: "corrupt",
      reason: "position tick range is inverted",
    });
    expect(
      decodePersonalPosition(positionBytes({ tickLower: -500_000, tickUpper: 10 })),
    ).toMatchObject({ status: "corrupt" });
  });
});
