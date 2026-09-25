// @ts-check
/**
 * The fee a pump trade actually pays, read from the fee program rather than reconstructed.
 *
 * Pump replaced its flat fee with a schedule that depends on the coin's market cap on
 * 2025-09-01. The rates live in the fee program's `FeeConfig` as a table of tiers, and the
 * bonding-curve program reads them itself through `GetFeesWithQuoteMint` — `Global`'s
 * `fee_basis_points` and the curve's `creator_fee_bps` are the superseded structure.
 *
 * Reconstructing the old schedule is not a small inaccuracy. The fee decides `min_tokens_out`
 * and `min_sol_output`, the floors the program enforces, so underestimating it sets a floor the
 * fill cannot clear and the transaction reverts. Measured on mainnet 2026-09-25: the live table
 * charges 95 protocol + 30 creator = 125 bps, while the curve's own `creator_fee_bps` reads 0,
 * so the old arithmetic produced 95 and every trade was priced 30 bps light. Pump's own note on
 * the change suggests widening slippage "until you make sure it's implemented correctly" —
 * widening slippage is what hides this, so the fee is read instead.
 *
 * Arithmetic is `bondingCurveMarketCap` and `calculateFeeTier` from the pinned
 * `docs/FEE_PROGRAM_README.md`, in integers throughout: the threshold is a u128 and the market
 * cap of a live curve exceeds what a double can hold exactly.
 */
import { FEE_CONFIG_DISCRIMINATOR } from "./pump-program.js";

/** 8 discriminator + 1 bump + 32 admin puts `flat_fees` at 41; it is a `Fees`, three u64s, so
 * the tier vector's u32 count follows at 65. `flat_fees` itself is for non-pump pools. */
const TIERS_COUNT_OFFSET = 65;
const TIERS_START = 69;
/** One `FeeTier`: a u128 threshold then a `Fees`. */
const TIER_BYTES = 40;
const TIER_PROTOCOL_OFFSET = 24;
const TIER_CREATOR_OFFSET = 32;
/** SPL mint layout, classic and Token-2022 alike: `supply` at bytes 36..44. */
const MINT_SUPPLY_START = 36;
const MINT_SUPPLY_END = 44;

/** @param {Uint8Array} bytes @param {number} offset */
const u64 = (bytes, offset) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);

/** @param {Uint8Array} bytes @param {number} offset */
const u128 = (bytes, offset) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(offset, true) + (view.getBigUint64(offset + 8, true) << 64n);
};

/** @param {Uint8Array} bytes */
const hasFeeConfigDiscriminator = (bytes) =>
  FEE_CONFIG_DISCRIMINATOR.every((expected, index) => bytes[index] === expected);

/**
 * @typedef {{ readonly threshold: bigint; readonly protocolFeeBps: bigint; readonly creatorFeeBps: bigint }} FeeTier
 * @typedef {{ readonly status: "decoded"; readonly tiers: readonly FeeTier[] }
 *   | { readonly status: "absent" }
 *   | { readonly status: "corrupt" }} FeeConfigRead
 */

/**
 * Decode the tier table. An absent account is distinct from an unreadable one: the reference
 * implementation falls back to `Global` only when there is no fee config at all, so a present
 * account we cannot parse must refuse rather than quietly price against the old schedule.
 * @param {Uint8Array | null} bytes
 * @returns {FeeConfigRead}
 */
export const decodeFeeConfig = (bytes) => {
  if (bytes === null) return { status: "absent" };
  if (bytes.length < TIERS_START || !hasFeeConfigDiscriminator(bytes)) return { status: "corrupt" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(TIERS_COUNT_OFFSET, true);
  if (count === 0 || bytes.length < TIERS_START + TIER_BYTES * count) return { status: "corrupt" };
  const tiers = Array.from({ length: count }, (_, index) => {
    const at = TIERS_START + TIER_BYTES * index;
    return {
      threshold: u128(bytes, at),
      protocolFeeBps: u64(bytes, at + TIER_PROTOCOL_OFFSET),
      creatorFeeBps: u64(bytes, at + TIER_CREATOR_OFFSET),
    };
  });
  return { status: "decoded", tiers };
};

/**
 * The mint's own supply, which is what the market cap is denominated in — not the curve's
 * `token_total_supply`. The two differ: the live coin measured on 2026-09-25 carried 2e15 on the
 * mint against 1e15 on its curve, so the choice changes which tier applies.
 * @param {Uint8Array | null} bytes @returns {bigint | undefined}
 */
export const mintSupply = (bytes) =>
  bytes === null || bytes.length < MINT_SUPPLY_END ? undefined : u64(bytes, MINT_SUPPLY_START);

/**
 * `virtual_sol_reserves * mint_supply / virtual_token_reserves`, per the pinned reference.
 * A curve with no virtual tokens cannot define a market cap; it yields zero, which selects the
 * first tier exactly as any market cap below the first threshold does.
 * @param {{ mintSupply: bigint; virtualQuoteReserves: bigint; virtualTokenReserves: bigint }} curve
 */
export const bondingCurveMarketCap = ({
  mintSupply,
  virtualQuoteReserves,
  virtualTokenReserves,
}) =>
  virtualTokenReserves === 0n ? 0n : (virtualQuoteReserves * mintSupply) / virtualTokenReserves;

/**
 * `calculate_fee_tier`: below the first threshold the first tier applies, otherwise the last
 * tier the market cap reaches.
 * @param {readonly FeeTier[]} tiers @param {bigint} marketCap
 */
export const feeTierAt = (tiers, marketCap) =>
  tiers.findLast((tier) => marketCap >= tier.threshold) ?? tiers[0];

/**
 * The total fee one trade pays, or the reason it cannot be priced.
 * @param {{
 *   feeConfig: FeeConfigRead;
 *   global: { feeBasisPoints?: bigint; creatorFeeBasisPoints?: bigint };
 *   curve: { virtualQuoteReserves: bigint; virtualTokenReserves: bigint };
 *   supply: bigint | undefined;
 * }} reads
 */
export const resolveFeeBps = ({ feeConfig, global, curve, supply }) => {
  if (feeConfig.status === "corrupt") return FEE_UNREADABLE;
  // No fee config at all is the reference's documented fallback, and it uses Global's own
  // creator rate — never the curve's, which is not part of that computation.
  if (feeConfig.status === "absent") {
    return ok((global.feeBasisPoints ?? 0n) + (global.creatorFeeBasisPoints ?? 0n));
  }
  if (supply === undefined) return MINT_UNREADABLE;
  const marketCap = bondingCurveMarketCap({
    mintSupply: supply,
    virtualQuoteReserves: curve.virtualQuoteReserves,
    virtualTokenReserves: curve.virtualTokenReserves,
  });
  const tier = feeTierAt(feeConfig.tiers, marketCap);
  // The decoder refuses an empty table, so this cannot be reached — but a fee that silently
  // became zero would set a floor no fill can clear, so it refuses rather than assumes.
  if (tier === undefined) return FEE_UNREADABLE;
  return ok(tier.protocolFeeBps + tier.creatorFeeBps);
};

/** @param {bigint} totalFeeBps */
const ok = (totalFeeBps) => ({ ok: /** @type {const} */ (true), totalFeeBps });

const FEE_UNREADABLE = {
  ok: /** @type {const} */ (false),
  reason: "the pump fee config is present but not a readable fee schedule",
};
const MINT_UNREADABLE = {
  ok: /** @type {const} */ (false),
  reason: "the mint account is too short to carry a supply",
};
