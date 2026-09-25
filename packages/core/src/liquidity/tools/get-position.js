// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityGetPositionInputSchema, isReadable } from "../domain/types.js";
import { getLpPosition } from "../use-cases/get-position.js";

export const getLpPositionTool = defineTool({
  name: "solana_liquidity_get_position",
  group: "liquidity",
  tier: "read",
  title: "Get a concentrated-liquidity LP position",
  description:
    "Read one existing concentrated-liquidity LP position on orca (Whirlpools) or raydium " +
    "(CLMM): its exact raw liquidity (the u128 share) and the underlying token A and token B " +
    "amounts in base units with the mints' decimals. position is the protocol position " +
    "account — the Whirlpool position PDA on orca, the PersonalPositionState PDA on raydium " +
    "— never the position NFT mint and never the pool. Ownership is proven by custody of the " +
    "position NFT, so a missing, foreign-owned or corrupt position is a typed error, never a " +
    "fabricated zero; an owned zero-liquidity position is a successful zero read. owner " +
    "defaults to the configured signer, so any third party's position can be read by naming " +
    "its owner. valueUsd is always null. meteora fails before any network access. Read-only: " +
    "nothing is deposited, withdrawn, claimed, or signed.",
  input: LiquidityGetPositionInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a
  // supported-but-unimplemented protocol never builds the Layers at all.
  check: (input) => {
    if (!isReadable(input.protocol)) {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => getLpPosition(input),
});
