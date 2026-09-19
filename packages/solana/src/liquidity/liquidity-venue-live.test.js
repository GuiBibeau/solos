// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { decreaseLiquidityQuote } from "@orca-so/whirlpools-core";
import { randomAddress } from "./liquidity-seeds.js";
import {
  BELOW_SQRT_PRICE,
  LIQUIDITY,
  startLiquidityVenueFixture,
} from "./liquidity-venue-fixture.js";
import { SQRT_PRICE_ONE } from "./whirlpool-fixture.js";

/** @type {Awaited<ReturnType<typeof startLiquidityVenueFixture>>} */
let fx;

beforeAll(async () => {
  fx = await startLiquidityVenueFixture();
});

describe("liquidity position reads over seeded Surfnet [integration]", () => {
  test("a funded in-range position decodes with exact identity, units, and null valuation", async () => {
    const result = await fx.readPosition({
      protocol: "orca",
      position: fx.funded.position,
      owner: fx.owner,
    });
    expect(result).toMatchObject({
      kind: "lp",
      protocol: "orca",
      position: fx.funded.position,
      instrument: fx.pool.pool,
      liquidity: LIQUIDITY.toString(),
      valueUsd: null,
    });
    const quote = decreaseLiquidityQuote(LIQUIDITY, 0, SQRT_PRICE_ONE, -1000, 1000);
    expect(result?.tokenA).toEqual({
      mint: fx.pool.mintA,
      amount: quote.tokenEstA.toString(),
      decimals: 6,
    });
    expect(result?.tokenB).toEqual({
      mint: fx.pool.mintB,
      amount: quote.tokenEstB.toString(),
      decimals: 9,
    });
  });

  test("an owned zero-liquidity position is a successful zero read, never an error", async () => {
    const result = await fx.readPosition({
      protocol: "orca",
      position: fx.empty.position,
      owner: fx.owner,
    });
    expect(result).toMatchObject({
      position: fx.empty.position,
      liquidity: "0",
      tokenA: { amount: "0" },
      tokenB: { amount: "0" },
      valueUsd: null,
    });
  });

  test("a below-range position prices token A across the full range and zero token B", async () => {
    const result = await fx.readPosition({
      protocol: "orca",
      position: fx.below.position,
      owner: fx.owner,
    });
    const quote = decreaseLiquidityQuote(LIQUIDITY, 0, BELOW_SQRT_PRICE, 0, 1000);
    expect(result?.liquidity).toBe(LIQUIDITY.toString());
    expect(result?.tokenA.amount).toBe(quote.tokenEstA.toString());
    expect(result?.tokenB.amount).toBe("0");
  });

  test("a transferred NFT fails the custody guard as unavailable, not a fabricated zero", async () => {
    const result = await fx.readPosition({
      protocol: "orca",
      position: fx.foreign.position,
      owner: fx.owner,
    });
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      position: fx.foreign.position,
      reason: "owner does not hold the position NFT",
    });
  });

  test("a nonexistent account fails the very first guard", async () => {
    const absent = randomAddress();
    const result = await fx.readPosition({ protocol: "orca", position: absent, owner: fx.owner });
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      position: absent,
      reason: "no account at the position address",
    });
  });

  test("each corrupt state fails typed at its own guard", async () => {
    const cases = /** @type {const} */ ([
      [fx.impostor.position, "position account is not owned by the pinned Whirlpool program"],
      [fx.badDiscriminator.position, "position data does not carry the Position discriminator"],
      [fx.shortBytes.position, "position account has the wrong layout"],
      [fx.missingPool.position, "referenced pool is missing"],
      [
        fx.againstBadDiscPool.position,
        "referenced pool does not carry the Whirlpool discriminator",
      ],
      [fx.againstNoMintPool.position, "pool mint is missing"],
    ]);
    for (const [position, reason] of cases) {
      const result = await fx.readPosition({ protocol: "orca", position, owner: fx.owner });
      expect(result, position).toMatchObject({
        _tag: "LiquidityPositionUnavailable",
        position,
        reason,
      });
    }
  });

  test("two positions in one pool stay distinct positions with distinct receipts", async () => {
    const funded = await fx.readPosition({
      protocol: "orca",
      position: fx.funded.position,
      owner: fx.owner,
    });
    const empty = await fx.readPosition({
      protocol: "orca",
      position: fx.empty.position,
      owner: fx.owner,
    });
    expect(funded?.position).toBe(fx.funded.position);
    expect(empty?.position).toBe(fx.empty.position);
    expect(funded?.position).not.toBe(empty?.position);
    expect(funded?.instrument).toBe(empty?.instrument);
    expect(funded?.liquidity).toBe(LIQUIDITY.toString());
    expect(empty?.liquidity).toBe("0");
  });
});
