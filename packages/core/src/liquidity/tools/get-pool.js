// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { poolReadUnsupported } from "../domain/errors.js";
import { LiquidityGetPoolInputSchema } from "../domain/pool-state.js";
import { SUPPORTED_VENUES } from "../domain/supported-venues.js";
import { isPoolReadable } from "../domain/types.js";
import { getPool } from "../use-cases/get-pool.js";

export const getPoolTool = defineTool({
  name: "solana_liquidity_get_pool",
  group: "liquidity",
  tier: "read",
  stability: "beta",
  title: "Get a Meteora DLMM pool price",
  description:
    "Read where a Meteora DLMM pool is trading right now: its active bin, bin step, and " +
    "priceAPerB, which is how many token B equal one token A after mint-decimal adjustment. " +
    "pool is the LbPair address, never a position account and never an NFT mint. Orca and " +
    "Raydium have no pool read; asking for one fails typed and names " +
    "solana_liquidity_get_position. Read-only: nothing is deposited, withdrawn, or signed. " +
    SUPPORTED_VENUES,
  input: LiquidityGetPoolInputSchema,
  // Pure guard: dispatchers run it before the runtime is acquired, so a non-Meteora pool
  // never builds the Layers at all.
  check: (input) => {
    if (!isPoolReadable(input.protocol)) throw poolReadUnsupported(input.protocol);
  },
  run: (input) => getPool(input),
});
