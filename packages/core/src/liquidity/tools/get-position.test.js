// @ts-check
import { describe, expect, test } from "bun:test";
import { LpPositionSchema } from "@solos/actions";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityGetPositionInputSchema } from "../domain/types.js";
import { getLpPositionTool } from "./get-position.js";

describe("liquidity position tool input guard", () => {
  // Enum membership is not implementation. meteora parses and is refused here, before the
  // signer-bearing runtime is ever built; raydium has an adapter as of #128 and passes.
  test("rejects a protocol with no adapter before any runtime", () => {
    expect(getLpPositionTool.check).toBeTypeOf("function");
    expect(() =>
      getLpPositionTool.check({ protocol: "meteora", position: "2".repeat(44) }),
    ).toThrow(LiquidityUnsupportedProtocol);
  });

  test("accepts raydium, which has a read adapter", () => {
    expect(
      getLpPositionTool.check({ protocol: "raydium", position: "2".repeat(44) }),
    ).toBeUndefined();
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
