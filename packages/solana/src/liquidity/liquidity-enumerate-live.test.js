// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { randomAddress, seedTokenAccounts, seedWhirlpoolPosition } from "./liquidity-seeds.js";
import { LIQUIDITY, startLiquidityVenueFixture } from "./liquidity-venue-fixture.js";

/** Deterministic ordering for address-set comparisons. @param {readonly string[]} addresses */
const sorted = (addresses) => addresses.toSorted((a, b) => a.localeCompare(b));

/** @type {Awaited<ReturnType<typeof startLiquidityVenueFixture>>} */
let fx;

beforeAll(async () => {
  fx = await startLiquidityVenueFixture();
});

describe("liquidity owner enumeration over seeded Surfnet [integration]", () => {
  test("enumeration is complete: positions, empty perpAccounts, and the receipt mints", async () => {
    const owner = randomAddress();
    const first = await seedWhirlpoolPosition(fx.rpcUrl, {
      pool: fx.pool.pool,
      owner,
      liquidity: LIQUIDITY,
    });
    const second = await seedWhirlpoolPosition(fx.rpcUrl, { pool: fx.pool.pool, owner });
    // An unrelated NFT whose position PDA is absent is a candidate, then skipped.
    await seedTokenAccounts(fx.rpcUrl, owner, 1);
    const result = await fx.readEnumeration({ protocol: "orca", owner });
    expect(result.positions).toHaveLength(2);
    expect(result.perpAccounts).toEqual([]);
    expect(sorted(result.receiptMints)).toEqual(sorted([first.positionMint, second.positionMint]));
    const addresses = result.positions.map((/** @type {{ position: string }} */ p) => p.position);
    expect(sorted(addresses)).toEqual(sorted([first.position, second.position]));
  });

  test("one corrupt candidate fails the whole enumeration typed, never a partial array", async () => {
    const result = await fx.readEnumeration({ protocol: "orca", owner: fx.owner });
    expect(result._tag).toBe("LiquidityPositionUnavailable");
    expect(result.reason).toEqual(
      expect.stringMatching(/pinned Whirlpool program|discriminator|wrong layout|missing/),
    );
  });

  test("the 256-candidate bound fails the whole enumeration typed", async () => {
    const bound = randomAddress();
    await seedTokenAccounts(fx.rpcUrl, bound, 257);
    const result = await fx.readEnumeration({ protocol: "orca", owner: bound });
    expect(result).toMatchObject({
      _tag: "LiquidityEnumerationIncomplete",
      reason: "owner holds more than 256 candidate position mints",
    });
  });
});
