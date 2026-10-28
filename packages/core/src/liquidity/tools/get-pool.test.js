// @ts-check
import { describe, expect, test } from "bun:test";
import {
  LiquidityUnsupportedProtocol,
  POOL_READ_REASON,
  POOL_READ_REMEDY,
} from "../domain/errors.js";
import { LiquidityGetPoolInputSchema } from "../domain/pool-state.js";
import { SUPPORTED_VENUES } from "../domain/supported-venues.js";
import { getPoolTool } from "./get-pool.js";

const POOL = "2".repeat(32);

describe("liquidity pool tool", () => {
  test("is a read-tier liquidity tool and describes every argument", () => {
    expect(getPoolTool.name).toBe("solana_liquidity_get_pool");
    expect(getPoolTool.group).toBe("liquidity");
    expect(getPoolTool.tier).toBe("read");
    expect(getPoolTool.stability).toBe("beta");
    expect(getPoolTool.action).toBeUndefined();
    expect(getPoolTool.description).toContain(SUPPORTED_VENUES);
    expect(getPoolTool.description).toContain("Meteora");
    expect(getPoolTool.input.shape.protocol?.description).toBeTruthy();
    expect(getPoolTool.input.shape.pool?.description).toBeTruthy();
  });

  test("meteora passes the guard; orca and raydium name the position read", () => {
    expect(getPoolTool.check({ protocol: "meteora", pool: POOL })).toBeUndefined();
    for (const protocol of ["orca", "raydium"]) {
      /** @type {unknown} */
      let caught;
      try {
        getPoolTool.check({ protocol, pool: POOL });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LiquidityUnsupportedProtocol);
      expect(caught).toMatchObject({
        protocol,
        reason: POOL_READ_REASON,
        remedy: POOL_READ_REMEDY,
      });
    }
  });

  test("the schema rejects an unknown protocol and a missing pool", () => {
    expect(LiquidityGetPoolInputSchema.safeParse({ protocol: "jupiter", pool: POOL }).success).toBe(
      false,
    );
    expect(LiquidityGetPoolInputSchema.safeParse({ protocol: "meteora" }).success).toBe(false);
  });
});
