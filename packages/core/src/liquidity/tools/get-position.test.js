// @ts-check
import { describe, expect, test } from "bun:test";
import { LpPositionSchema } from "@solos/actions";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityGetPositionInputSchema } from "../domain/types.js";
import { getLpPositionTool } from "./get-position.js";

describe("liquidity position tool input guard", () => {
  test("rejects supported-but-unimplemented protocols before any runtime", () => {
    expect(getLpPositionTool.check).toBeTypeOf("function");
    for (const protocol of ["meteora", "raydium"]) {
      expect(
        () => getLpPositionTool.check({ protocol, position: "2".repeat(44) }),
        protocol,
      ).toThrow(LiquidityUnsupportedProtocol);
    }
  });

  test("accepts orca with an optional owner", () => {
    expect(getLpPositionTool.check({ protocol: "orca", position: "2".repeat(44) })).toBeUndefined();
    expect(
      getLpPositionTool.check({
        protocol: "orca",
        position: "2".repeat(44),
        owner: "11111111111111111111111111111111",
      }),
    ).toBeUndefined();
  });

  test("the schema rejects unknown protocol values before the guard runs", () => {
    expect(
      LiquidityGetPositionInputSchema.safeParse({ protocol: "jupiter", position: "2".repeat(44) })
        .success,
    ).toBe(false);
    expect(LiquidityGetPositionInputSchema.safeParse({ protocol: "orca" }).success).toBe(false);
  });

  test("the tool is a read-tier liquidity tool and describes every argument", () => {
    expect(getLpPositionTool.name).toBe("solana_liquidity_get_position");
    expect(getLpPositionTool.group).toBe("liquidity");
    expect(getLpPositionTool.tier).toBe("read");
    expect(getLpPositionTool.input.shape.protocol?.description).toBeTruthy();
    expect(getLpPositionTool.input.shape.position?.description).toBeTruthy();
    expect(getLpPositionTool.input.shape.owner?.description).toBeTruthy();
  });

  test("the protocol enum mirrors the merged LpPosition contract", () => {
    for (const protocol of ["orca", "meteora", "raydium"]) {
      const base = {
        kind: "lp",
        protocol,
        position: "2".repeat(44),
        instrument: "2".repeat(44),
        liquidity: "0",
        tokenA: { mint: "3".repeat(44), amount: "0", decimals: 6 },
        tokenB: { mint: "4".repeat(44), amount: "0", decimals: 9 },
        valueUsd: null,
      };
      expect(LpPositionSchema.safeParse(base).success, protocol).toBe(true);
    }
  });
});
