// @ts-check
import { describe, expect, test } from "bun:test";
import { decodePosition, decodeWhirlpool, positionAddress } from "./whirlpool-decode.js";
import {
  positionBytes,
  whirlpoolBytes,
  addressBytes,
  SQRT_PRICE_ONE,
} from "./whirlpool-fixture.js";
import {
  MAX_TICK_INDEX,
  MIN_TICK_INDEX,
  POSITION_BYTES,
  WHIRLPOOL_BYTES,
  WHIRLPOOL_PROGRAM,
} from "./whirlpool-program.js";

const POOL = "So11111111111111111111111111111111111111112";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** The base58 form of the fixture's default 32 zero vault bytes: one '1' per zero byte. */
const VAULT = "1".repeat(32);

describe("whirlpool position decode with mandatory guards", () => {
  test("an empty position decodes with exact identity fields", () => {
    const decoded = decodePosition(
      positionBytes({ whirlpool: addressBytes(POOL), positionMint: addressBytes(MINT) }),
    );
    expect(decoded).toEqual({
      status: "decoded",
      layout: {
        whirlpool: POOL,
        positionMint: MINT,
        liquidity: 0n,
        tickLowerIndex: -1000,
        tickUpperIndex: 1000,
      },
    });
  });

  test("a funded position round-trips the exact u128 liquidity", () => {
    const liquidity = (1n << 100n) + 123_456_789n;
    const decoded = decodePosition(positionBytes({ liquidity }));
    expect(decoded.status).toBe("decoded");
    expect(decoded.layout?.liquidity).toBe(liquidity);
  });

  test("the wrong discriminator is corrupt, never silently decoded", () => {
    const bytes = positionBytes({
      discriminator: new Uint8Array([63, 149, 209, 12, 225, 128, 99, 9]),
    });
    expect(decodePosition(bytes)).toEqual({
      status: "corrupt",
      reason: "position data does not carry the Position discriminator",
    });
  });

  test("a truncated account fails the exact-size guard", () => {
    expect(decodePosition(positionBytes({ bytes: POSITION_BYTES - 1 })).status).toBe("corrupt");
    expect(decodePosition(positionBytes({ bytes: 100 })).status).toBe("corrupt");
  });

  test("a padded account fails the exact-size guard too", () => {
    const padded = new Uint8Array(POSITION_BYTES + 8);
    padded.set(positionBytes());
    expect(decodePosition(padded).status).toBe("corrupt");
  });

  test("an inverted tick range cannot reach the math", () => {
    const decoded = decodePosition(positionBytes({ tickLowerIndex: 5, tickUpperIndex: 5 }));
    expect(decoded).toMatchObject({ status: "corrupt", reason: "position tick range is inverted" });
  });

  test("tick ranges outside the protocol bounds are corrupt", () => {
    const low = decodePosition(
      positionBytes({ tickLowerIndex: MIN_TICK_INDEX - 1, tickUpperIndex: 0 }),
    );
    const high = decodePosition(
      positionBytes({ tickLowerIndex: 0, tickUpperIndex: MAX_TICK_INDEX + 1 }),
    );
    expect(low.status).toBe("corrupt");
    expect(high.status).toBe("corrupt");
  });
});

describe("whirlpool pool decode with mandatory guards", () => {
  test("a 653-byte pool decodes its sqrt price and mints", () => {
    const decoded = decodeWhirlpool(
      whirlpoolBytes({
        sqrtPrice: SQRT_PRICE_ONE,
        tokenMintA: addressBytes(MINT),
        tokenMintB: addressBytes(POOL),
      }),
    );
    expect(decoded).toEqual({
      status: "decoded",
      layout: {
        sqrtPrice: SQRT_PRICE_ONE,
        tokenMintA: MINT,
        tokenMintB: POOL,
        tickSpacing: 64,
        tokenVaultA: VAULT,
        tokenVaultB: VAULT,
      },
    });
  });

  test("a pool-sized Position is corrupt for the pool decoder and vice versa", () => {
    expect(decodeWhirlpool(positionBytes()).status).toBe("corrupt");
    expect(decodeWhirlpool(whirlpoolBytes({ bytes: WHIRLPOOL_BYTES - 1 })).status).toBe("corrupt");
    expect(decodePosition(whirlpoolBytes()).status).toBe("corrupt");
  });

  test("the pool program pin is the deployed Whirlpools address", () => {
    expect(WHIRLPOOL_PROGRAM).toBe("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
  });

  test("position PDAs derive offline, deterministically, from the seed and mint", async () => {
    const pda = await positionAddress(MINT);
    expect(pda).not.toBe(MINT);
    expect(await positionAddress(MINT)).toBe(pda);
  });
});
