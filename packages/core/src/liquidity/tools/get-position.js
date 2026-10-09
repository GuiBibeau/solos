// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { SUPPORTED_VENUES } from "../domain/supported-venues.js";
import { isPositionReadable, LiquidityGetPositionInputSchema } from "../domain/types.js";
import { getLpPosition } from "../use-cases/get-position.js";

export const getLpPositionTool = defineTool({
  name: "solana_liquidity_get_position",
  group: "liquidity",
  tier: "read",
  stability: "beta",
  title: "Get a concentrated-liquidity LP position",
  description:
    "Read one existing concentrated-liquidity LP position on orca (Whirlpools), raydium " +
    "(CLMM), or meteora (DLMM): its raw liquidity and the underlying token A and token B " +
    "amounts in base units with the mints' decimals. position is the protocol position " +
    "account (the Whirlpool position PDA on orca, the PersonalPositionState PDA on raydium, " +
    "the PositionV2 account on meteora), never an NFT mint and never the pool. On orca and " +
    "raydium, ownership is custody of the position NFT. On meteora, the position account's " +
    "owner field must equal the requested owner. A missing, foreign-owned, or corrupt " +
    "position is a typed error, never a fabricated zero; an owned zero-liquidity position " +
    "is a successful zero read. owner defaults to the configured signer, so any third " +
    "party's position can be read by naming its owner. valueUsd is always null. Deposits " +
    "and withdrawals stay inside the existing bins. " +
    "Read-only: nothing is deposited, withdrawn, claimed, or signed. " +
    SUPPORTED_VENUES,
  input: LiquidityGetPositionInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a
  // supported-but-unimplemented protocol never builds the Layers at all.
  check: (input) => {
    if (!isPositionReadable(input.protocol)) {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => getLpPosition(input),
});
