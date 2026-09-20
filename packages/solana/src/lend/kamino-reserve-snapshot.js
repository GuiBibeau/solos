// @ts-check
/** @typedef {import("@solos/core/lend").ReserveSnapshot} ReserveSnapshot */
import {
  LendingResponseInvalid,
  ReserveUnavailable,
  formatApy,
  ReserveSnapshotSchema,
} from "@solos/core/lend";
import { Effect } from "effect";

/**
 * The structural pieces the pure mapping needs from one loaded SDK reserve. Keeping them
 * primitive makes this file pure domain logic: the unit tests exercise it with plain objects,
 * no SDK, no BN, no network.
 * @typedef {{
 *   readonly market: string;
 *   readonly mint: string;
 *   readonly reserveAddress: string;
 *   readonly liquidityMint: string;
 *   readonly availableAmount: { readonly toString: () => string };
 *   readonly decimals: number;
 *   readonly supplyApy: number;
 *   readonly borrowApy: number;
 * }} ReserveParts
 */

/**
 * Map one loaded reserve to the snapshot contract. The exact mint/reserve mapping is checked
 * here: a reserve whose liquidity mint differs from the request is a `ReserveUnavailable`,
 * never a near-miss answer. APYs pass through the slice's `formatApy` (non-finite or negative
 * is `LendingResponseInvalid`), the available amount stays a base-unit decimal string (BN
 * `toString`, never a Number), and the final object is validated against the snapshot schema
 * so a decoded value that violates the contract cannot escape the adapter.
 * @param {ReserveParts} parts
 * @returns {Effect.Effect<ReserveSnapshot, ReserveUnavailable | LendingResponseInvalid>}
 */
export const reserveSnapshot = (parts) =>
  Effect.gen(function* () {
    if (parts.liquidityMint !== parts.mint) {
      return yield* new ReserveUnavailable({
        market: parts.market,
        mint: parts.mint,
        reason: "the reserve's liquidity mint differs from the requested mint",
      });
    }
    const supplyApy = formatApy(parts.supplyApy);
    const borrowApy = formatApy(parts.borrowApy);
    if (supplyApy === null || borrowApy === null) {
      return yield* new LendingResponseInvalid({
        reason: "reserve APYs are not finite non-negative numbers",
      });
    }
    const parsed = ReserveSnapshotSchema.safeParse({
      protocol: "kamino",
      market: parts.market,
      reserve: parts.reserveAddress,
      mint: parts.mint,
      decimals: parts.decimals,
      supplyApy,
      borrowApy,
      liquidity: parts.availableAmount.toString(),
      at: Date.now(),
    });
    if (!parsed.success) {
      return yield* new LendingResponseInvalid({
        reason: "decoded reserve values violate the snapshot schema",
      });
    }
    return parsed.data;
  });
