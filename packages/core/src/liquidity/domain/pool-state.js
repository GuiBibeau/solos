// @ts-check
import { DecimalSchema } from "@solos-sh/actions";
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { LiquidityProtocolSchema } from "./types.js";

/** @typedef {import("../../shared/domain/address.js").Address} Address */
/** @typedef {z.infer<typeof PoolStateSchema>} PoolState */
/** @typedef {z.infer<typeof LiquidityGetPoolInputSchema>} LiquidityGetPoolInput */

const mintDecimals = z.number().int().min(0).max(255);

const poolMint = z.object({
  mint: AddressSchema.describe("Pool token mint"),
  decimals: mintDecimals.describe("Mint decimals, from the mint account"),
});

/**
 * Where a Meteora DLMM pool is trading. `priceAPerB` is how many token B equal one token A
 * after mint-decimal adjustment: `priceOfBin(activeId, binStep)` times 10^(decimalsA - decimalsB).
 * Token A is the pair's token X and token B is token Y. `at` is the read time.
 */
export const PoolStateSchema = z.object({
  protocol: z.literal("meteora"),
  pool: AddressSchema.describe("Meteora DLMM LbPair address"),
  tokenA: poolMint,
  tokenB: poolMint,
  activeId: z.number().int().describe("Active bin id"),
  binStep: z.number().int().positive().describe("Bin step in basis points"),
  priceAPerB: DecimalSchema.describe(
    "Token B per one token A at the active bin, adjusted for mint decimals",
  ),
  at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "ISO-8601 timestamp")
    .describe("ISO-8601 time of the read"),
});

/**
 * One pool read, after input validation. The use case refuses orca and raydium before the
 * venue is touched; the adapter repeats that refusal.
 * @typedef {{ readonly protocol: "orca" | "meteora" | "raydium"; readonly pool: Address }} LiquidityGetPoolRequest
 */

/** One pool-price read. `pool` is the LbPair, never a position account. */
export const LiquidityGetPoolInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. The pool read is implemented for meteora (DLMM) only. orca and raydium fail with LiquidityUnsupportedProtocol and name solana_liquidity_get_position",
  ),
  pool: AddressSchema.describe(
    "Meteora DLMM LbPair address. Never a position account and never an NFT mint",
  ),
});
