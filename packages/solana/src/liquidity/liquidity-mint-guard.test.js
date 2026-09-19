// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { startLiquidityVenueFixture } from "./liquidity-venue-fixture.js";

/**
 * Pool-mint guards over seeded Surfnet: a pool mint is guarded as a mint (token-program
 * owner, size, decodable initialized layout) before any use, and every unusable mint fails
 * typed LiquidityPositionUnavailable with its fixed reason — never a raw decoder exception.
 */

/** @type {Awaited<ReturnType<typeof startLiquidityVenueFixture>>} */
let fx;

beforeAll(async () => {
  fx = await startLiquidityVenueFixture();
});

describe("pool-mint guards over seeded Surfnet [integration]", () => {
  test("a pool mint at a wrong owner program fails the mint guard typed", async () => {
    const result = await fx.readPosition({
      protocol: "orca",
      position: fx.againstWrongOwnerMint.position,
      owner: fx.owner,
    });
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      position: fx.againstWrongOwnerMint.position,
      reason: "pool mint account is not owned by a token program",
    });
  });

  test("an undersized pool-mint account fails the mint guard typed", async () => {
    const result = await fx.readPosition({
      protocol: "orca",
      position: fx.againstShortMint.position,
      owner: fx.owner,
    });
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      position: fx.againstShortMint.position,
      reason: "pool mint account has the wrong size for a mint",
    });
  });
});
