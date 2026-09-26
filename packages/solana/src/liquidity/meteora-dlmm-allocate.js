// @ts-check
/**
 * ADR-0022 deposit allocation for one existing Meteora position.
 *
 * X is spread over bins at or above the active bin, Y over bins at or below it, both clipped
 * to the position's stored window. Each token's 10000 bps are uniform. Per-bin spends round
 * down. The active bin is then fit to its reserves (or to the bin price when the bin is empty)
 * and any excess stays unused. The result is the `LiquidityParameter` `add_liquidity2` encodes.
 */

import { uniformBps } from "./meteora-dlmm-allocate-bps.js";
import { allocationOf, encodeFitted } from "./meteora-dlmm-allocate-encode.js";
import { priceOfBin } from "./meteora-dlmm-price.js";
import { BINS_PER_ARRAY } from "./meteora-dlmm-program.js";

const BPS = 10_000n;

/** @typedef {{ readonly binId: number; readonly distributionX: number; readonly distributionY: number }} BinDistribution */
/** @typedef {{ readonly binId: number; readonly amountX: bigint; readonly amountY: bigint }} BinAmount */
/** @typedef {{ readonly amountX: bigint; readonly amountY: bigint; readonly bins: readonly BinDistribution[]; readonly spentX: bigint; readonly spentY: bigint; readonly liquidity: bigint }} DepositAllocation */
/** @typedef {{ readonly status: "ok"; readonly allocation: DepositAllocation } | { readonly status: "reject"; readonly reason: string }} AllocationResult */
/** @typedef {{ readonly lowerBinId: number; readonly upperBinId: number; readonly activeId: number; readonly binStep: number; readonly amountX: bigint; readonly amountY: bigint; readonly reserveX: bigint; readonly reserveY: bigint }} AllocateInput */

export { uniformBps } from "./meteora-dlmm-allocate-bps.js";

/** @param {string} reason @returns {{ readonly status: "reject"; readonly reason: string }} */
const reject = (reason) => ({ status: "reject", reason });

/** @param {bigint} left @param {bigint} right */
const minBig = (left, right) => {
  if (left < right) return left;
  return right;
};

/** Bins of active-id drift allowed for a slippage tolerance. @param {number} maxSlippageBps @param {number} binStep */
export const activeBinTolerance = (maxSlippageBps, binStep) => {
  if (binStep <= 0) return null;
  return Math.ceil(maxSlippageBps / binStep);
};

/** @param {number} before @param {number} after @param {number} tolerance */
export const activeBinMoved = (before, after, tolerance) => {
  const delta = after > before ? after - before : before - after;
  return delta > tolerance;
};

/** @param {AllocateInput} input @returns {number[] | null} */
const windowIds = (input) => {
  if (input.lowerBinId > input.upperBinId) return null;
  const width = input.upperBinId - input.lowerBinId + 1;
  if (width > BINS_PER_ARRAY) return null;
  return Array.from({ length: width }, (_unused, index) => input.lowerBinId + index);
};

/**
 * Fit the active bin so the deposit does not exceed either provisional amount.
 * Empty reserves with both sides funded use the bin price; a one-sided empty bin keeps that side.
 * @param {{ amountX: bigint; amountY: bigint; reserveX: bigint; reserveY: bigint; price: bigint }} bin
 * @returns {{ amountX: bigint; amountY: bigint } | null}
 */
export const fitActiveAmounts = (bin) => {
  if (bin.reserveX > 0n && bin.reserveY > 0n) return fitRatio(bin);
  if (bin.reserveX > 0n) return { amountX: bin.amountX, amountY: 0n };
  if (bin.reserveY > 0n) return { amountX: 0n, amountY: bin.amountY };
  if (bin.amountX === 0n || bin.amountY === 0n)
    return { amountX: bin.amountX, amountY: bin.amountY };
  if (bin.price === 0n) return null;
  const amountX = minBig(bin.amountX, (bin.amountY << 64n) / bin.price);
  return { amountX, amountY: (amountX * bin.price) >> 64n };
};

/** @param {{ amountX: bigint; amountY: bigint; reserveX: bigint; reserveY: bigint }} bin */
const fitRatio = (bin) => {
  const amountX = minBig(bin.amountX, (bin.amountY * bin.reserveX) / bin.reserveY);
  return { amountX, amountY: (amountX * bin.reserveY) / bin.reserveX };
};

/** @param {readonly number[]} ids @param {{ activeId: number; budget: bigint; atOrAbove: boolean }} side */
const sideAmounts = (ids, side) => {
  const eligible = ids.filter((binId) =>
    side.atOrAbove ? binId >= side.activeId : binId <= side.activeId,
  );
  const bps = uniformBps(eligible.length);
  const byId = new Map(
    eligible.map((binId, index) => [binId, (side.budget * BigInt(bps[index] ?? 0)) / BPS]),
  );
  return ids.map((binId) => byId.get(binId) ?? 0n);
};

/** @param {readonly BinAmount[]} bins @param {AllocateInput} input @param {bigint} price */
const fitWindow = (bins, input, price) => {
  /** @type {(BinAmount | null)[]} */
  const fitted = [];
  for (const bin of bins) {
    if (bin.binId !== input.activeId) {
      fitted.push(bin);
      continue;
    }
    const next = fitActiveAmounts({
      ...bin,
      reserveX: input.reserveX,
      reserveY: input.reserveY,
      price,
    });
    fitted.push(next === null ? null : { binId: bin.binId, ...next });
  }
  return fitted;
};

/** @param {BinAmount[]} provisional @param {AllocateInput} input @returns {AllocationResult} */
const finishAllocation = (provisional, input) => {
  const active = provisional.find((bin) => bin.binId === input.activeId);
  const price = active === undefined ? 1n : priceOfBin(active.binId, input.binStep);
  if (price === null) return reject("bin price is outside the pinned math");
  const encoded = encodeFitted(fitWindow(provisional, input, price), provisional, input);
  if (encoded.status === "reject") return encoded;
  const allocation = allocationOf(encoded, input.binStep);
  if (allocation === null) return reject("bin price is outside the pinned math");
  if (allocation.liquidity === 0n) return reject("the budgets buy no liquidity in this bin range");
  return { status: "ok", allocation };
};

/** @param {AllocateInput} input @returns {AllocationResult} */
export const allocateDeposit = (input) => {
  const ids = windowIds(input);
  if (ids === null) return reject("position bin window is not a single existing range");
  if (input.binStep <= 0) return reject("the pair bin step is zero");
  const amountX = sideAmounts(ids, {
    activeId: input.activeId,
    budget: input.amountX,
    atOrAbove: true,
  });
  const amountY = sideAmounts(ids, {
    activeId: input.activeId,
    budget: input.amountY,
    atOrAbove: false,
  });
  const provisional = ids.map((binId, index) => ({
    binId,
    amountX: amountX[index] ?? 0n,
    amountY: amountY[index] ?? 0n,
  }));
  return finishAllocation(provisional, input);
};
