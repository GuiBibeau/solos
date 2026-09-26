// @ts-check
/**
 * Share reduction and token floors for one Meteora remove.
 *
 * Each occupied bin loses `floor(share * bps / 10000)` of its own shares (ADR-0022).
 * A full exit passes the stored share through: the instruction's bps is 10000, and
 * treating that as a division that can drop a unit is the Raydium #131 dust class.
 * Token proceeds are `Bin::calculate_out_amount` on the removed share only. Fees
 * and rewards are not in the quote, because this path does not claim them.
 */
import { shareOfBin } from "./meteora-dlmm-bins.js";

const BASIS = 10_000n;
const FULL_EXIT = 10_000;
const U64_MAX = (1n << 64n) - 1n;

/** @typedef {{ readonly binId: number; readonly share: bigint }} ShareBin */
/** @typedef {{ readonly amountX: bigint; readonly amountY: bigint; readonly liquiditySupply: bigint }} Slot */
/** @typedef {{ readonly binId: number; readonly removed: bigint; readonly left: bigint }} ReducedBin */
/** @param {string} reason */
const reject = (reason) => ({ status: /** @type {const} */ ("reject"), reason });

/**
 * Shares taken from one bin. Full exit returns the stored share verbatim.
 * @param {bigint} share
 * @param {number} bps
 */
export const sharesRemoved = (share, bps) =>
  bps === FULL_EXIT ? share : (share * BigInt(bps)) / BASIS;

/** Shares left on one bin. @param {bigint} share @param {number} bps */
export const sharesLeft = (share, bps) => share - sharesRemoved(share, bps);

/** @param {bigint} quoted @param {number} maxSlippageBps */
export const receiptFloor = (quoted, maxSlippageBps) =>
  (quoted * BigInt(FULL_EXIT - maxSlippageBps)) / BASIS;

/**
 * @param {readonly ShareBin[]} bins
 * @param {number} bps
 */
const reducedBins = (bins, bps) => {
  /** @type {ReducedBin[]} */
  const rows = [];
  let liquidity = 0n;
  for (const bin of bins) {
    const removed = sharesRemoved(bin.share, bps);
    liquidity += removed;
    rows.push({ binId: bin.binId, removed, left: bin.share - removed });
  }
  return { liquidity, rows };
};

/**
 * @param {readonly ReducedBin[]} rows
 * @param {(binId: number) => Slot | undefined} slotFor
 */
const proceedsOf = (rows, slotFor) => {
  let estA = 0n;
  let estB = 0n;
  for (const row of rows) {
    const paid = row.removed === 0n ? null : sideProceeds(row, slotFor);
    if (paid === null) continue;
    if (paid.status !== "ok") return paid;
    estA += paid.amountX;
    estB += paid.amountY;
  }
  return { status: /** @type {const} */ ("ok"), estA, estB };
};

/**
 * @param {ReducedBin} row
 * @param {(binId: number) => Slot | undefined} slotFor
 */
const sideProceeds = (row, slotFor) => {
  const slot = slotFor(row.binId);
  if (slot === undefined) return reject("referenced bin is missing from its bin array");
  const x = shareOfBin(row.removed, slot.amountX, slot.liquiditySupply);
  if (x.status !== "ok") return reject(x.reason);
  const y = shareOfBin(row.removed, slot.amountY, slot.liquiditySupply);
  if (y.status !== "ok") return reject(y.reason);
  return { status: /** @type {const} */ ("ok"), amountX: x.amount, amountY: y.amount };
};

/** @param {bigint} estimate @param {bigint} minimum */
const isRoundedAway = (estimate, minimum) => minimum === 0n && estimate > 0n;

/** @param {bigint} amount */
const isAboveU64 = (amount) => amount > U64_MAX;

/**
 * @param {bigint} estA
 * @param {bigint} estB
 * @param {number} maxSlippageBps
 */
const boundsOf = (estA, estB, maxSlippageBps) => {
  const minA = receiptFloor(estA, maxSlippageBps);
  const minB = receiptFloor(estB, maxSlippageBps);
  if (isRoundedAway(estA, minA) || isRoundedAway(estB, minB)) {
    return reject(
      "the requested slippage tolerance rounds a nonzero quoted receipt to a zero minimum; tighten maxSlippageBps",
    );
  }
  if ([estA, estB, minA, minB].some(isAboveU64)) {
    return reject("a quoted receipt does not fit the instruction's u64 minimum");
  }
  return { status: /** @type {const} */ ("ok"), minA, minB };
};

/**
 * @param {{
 *   input: { bins: readonly ShareBin[]; bps: number };
 *   shares: { liquidity: bigint; rows: readonly ReducedBin[] };
 *   paid: { estA: bigint; estB: bigint };
 *   bounds: { minA: bigint; minB: bigint };
 * }} parts
 */
const quoted = ({ input, shares, paid, bounds }) => ({
  status: /** @type {const} */ ("ok"),
  liquidity: shares.liquidity,
  estA: paid.estA,
  estB: paid.estB,
  minA: bounds.minA,
  minB: bounds.minB,
  removes: shares.rows
    .filter((row) => row.removed > 0n)
    .map((row) => ({ binId: row.binId, bps: input.bps })),
  remaining: shares.rows.map((row) => ({ binId: row.binId, share: row.left })),
});

/**
 * Quote one removal. A bin whose floored share is zero is left out of `removes`
 * so the program is not asked to withdraw nothing. Full exit keeps every occupied bin.
 * @param {{ bins: readonly ShareBin[]; bps: number; maxSlippageBps: number;
 *   slotFor: (binId: number) => Slot | undefined }} input
 */
export const quoteRemoval = (input) => {
  const shares = reducedBins(input.bins, input.bps);
  if (shares.liquidity === 0n) {
    return reject(
      `${input.bps} bps of the position's current liquidity computes to zero liquidity`,
    );
  }
  const paid = proceedsOf(shares.rows, input.slotFor);
  if (paid.status !== "ok") return paid;
  const bounds = boundsOf(paid.estA, paid.estB, input.maxSlippageBps);
  if (bounds.status !== "ok") return bounds;
  return quoted({ input, shares, paid, bounds });
};
