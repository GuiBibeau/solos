// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { base58ByteLength } from "../../shared/domain/base58.js";

/**
 * A reserve request mint. Beyond the base58 shape, the address must decode to the 32 bytes of
 * a Solana public key, so undecodable input fails here instead of at the venue.
 */
const MintSchema = AddressSchema.refine(
  (value) => base58ByteLength(value) === 32,
  "mint must decode to a 32-byte Solana address",
);

/**
 * A non-negative fractional decimal string, the snapshot's APY shape: `0.05` means 5% per
 * year. `String()` of a finite non-negative JS number always matches — plain decimals like
 * `"0.05"`, and e-notation like `"5e-7"` for very small rates. Negative values are rejected;
 * the adapter turns them into `LendingResponseInvalid`, never a coerced number.
 */
export const FractionalApySchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/, "fractional decimal APY string");

/**
 * The u64 maximum, as a literal so the bound never depends on runtime widening.
 */
const MAX_U64 = 18_446_744_073_709_551_615n;

/**
 * An exact base-unit amount as a u64 integer string: no sign, no exponent, no leading zeros,
 * never through a JS Number. `"0"` is valid — an existing reserve with zero available
 * liquidity is a successful read. The bound check re-tests the digit grammar because Zod 4
 * runs refinements even when earlier checks failed, and `BigInt` throws on anything else.
 */
const U64AmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "u64 base-unit integer string")
  .refine(
    (value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= MAX_U64,
    "value exceeds the u64 maximum",
  );

/**
 * One Kamino reserve read. `market` and `reserve` carry the read's identities for later reads
 * and execution; `liquidity` is the reserve's available underlying token amount in base units
 * — never TVL, never USD. APYs are annual fractional decimals excluding incentive rewards;
 * they are observations, not promised returns.
 */
export const ReserveSnapshotSchema = z.object({
  protocol: z.literal("kamino"),
  market: AddressSchema,
  reserve: AddressSchema,
  mint: AddressSchema,
  decimals: z
    .number()
    .int()
    .min(0)
    .max(18)
    .describe("Decimals of the reserve's underlying liquidity mint"),
  supplyApy: FractionalApySchema.describe(
    "Annual supply APY as a fractional decimal string (0.05 = 5%), excluding incentive rewards",
  ),
  borrowApy: FractionalApySchema.describe(
    "Annual borrow APY as a fractional decimal string (0.05 = 5%), excluding incentive rewards",
  ),
  liquidity: U64AmountSchema.describe(
    "Available underlying token amount in base units, exact u64 integer string",
  ),
  at: z.number().int().describe("Unix epoch milliseconds when the reserve was received locally"),
});

/** @typedef {z.infer<typeof ReserveSnapshotSchema>} ReserveSnapshot */

/** Input of the reserve read: which mint's reserve to read in the configured market. */
export const GetReserveInputSchema = z.object({
  mint: MintSchema.describe(
    "Base58 mint of the token whose reserve to read in the configured market",
  ),
});

/** @typedef {z.infer<typeof GetReserveInputSchema>} GetReserveInput */
