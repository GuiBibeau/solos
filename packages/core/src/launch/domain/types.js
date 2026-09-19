// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { base58ByteLength } from "../../shared/domain/base58.js";

/**
 * A curve request mint. Beyond the base58 shape, the address must decode to the 32 bytes of a
 * Solana public key, so undecodable input fails here instead of at the PDA derivation.
 */
const MintSchema = AddressSchema.refine(
  (value) => base58ByteLength(value) === 32,
  "mint must decode to a 32-byte Solana address",
);

/** The u64 maximum, as a literal so the bound never depends on runtime widening. */
const MAX_U64 = 18_446_744_073_709_551_615n;

/**
 * An exact base-unit amount as a u64 integer string: no sign, no exponent, no leading zeros,
 * never through a JS Number. `"0"` is valid — a completed curve's reserves are zero. The
 * bound check re-tests the digit grammar because Zod 4 runs refinements even when earlier
 * checks failed, and `BigInt` throws on anything else.
 */
const U64AmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "u64 base-unit integer string")
  .refine(
    (value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= MAX_U64,
    "value exceeds the u64 maximum",
  );

/**
 * One bonding-curve state read. `mint` is the request echo, `program` the pinned pump program
 * the curve was verified under. `complete` is the on-chain flag only — it never claims a
 * PumpSwap migration pool exists. `progressBps` is 0..10000, floored and clamped. Reserves are
 * exact u64 base-unit integer strings.
 */
export const LaunchCurveSchema = z.object({
  mint: AddressSchema,
  program: AddressSchema,
  complete: z.boolean().describe("On-chain complete flag; does not prove a PumpSwap pool exists"),
  progressBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .describe(
      "Sold share of the initial real token reserves in basis points, floored and clamped to 0..10000",
    ),
  virtualSolReserves: U64AmountSchema.describe(
    "Virtual SOL reserves in lamports, exact base-unit integer string",
  ),
  virtualTokenReserves: U64AmountSchema.describe(
    "Virtual token reserves in base units, exact integer string",
  ),
});

/** @typedef {z.infer<typeof LaunchCurveSchema>} LaunchCurve */

/** Input of the launch curve read: which launched token's curve to read. */
export const GetCurveInputSchema = z.object({
  mint: MintSchema.describe("Base58 mint of the launched token whose bonding curve to read"),
});

/** @typedef {z.infer<typeof GetCurveInputSchema>} GetCurveInput */
