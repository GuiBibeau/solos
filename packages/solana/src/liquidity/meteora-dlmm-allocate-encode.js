// @ts-check
/**
 * Turn a fitted per-bin deposit into the `LiquidityParameter` `add_liquidity2` will honor.
 *
 * When the active-bin fit does not change the provisional amounts, the signed totals stay the
 * budgets and the bps stay the uniform spread, so the program's `floor(amount * bps / 10000)`
 * reproduces that spread. When the fit changes a bin, the signed total is the sum of the fitted
 * amounts and the bps are the largest-remainder share of those amounts. Bins that receive
 * neither token are omitted. A positive side's bps sum to 10000.
 */

import { uniformBps } from "./meteora-dlmm-allocate-bps.js";
import { sharesForDeposit } from "./meteora-dlmm-price.js";

const BPS = 10_000n;

/** @typedef {{ readonly binId: number; readonly amountX: bigint; readonly amountY: bigint }} BinAmount */
/** @typedef {{ readonly binId: number; readonly distributionX: number; readonly distributionY: number }} BinDistribution */
/** @typedef {{ readonly amountX: bigint; readonly amountY: bigint; readonly bins: readonly BinDistribution[]; readonly spentX: bigint; readonly spentY: bigint; readonly liquidity: bigint }} DepositAllocation */
/** @typedef {{ readonly status: "ok"; readonly amountX: bigint; readonly amountY: bigint; readonly bins: readonly BinAmount[]; readonly distX: readonly number[]; readonly distY: readonly number[] } | { readonly status: "reject"; readonly reason: string }} Encoded */

/** @param {string} reason */
const reject = (reason) => ({ status: /** @type {const} */ ("reject"), reason });

/** @param {readonly bigint[]} amounts */
const bpsFromAmounts = (amounts) => {
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);
  if (total === 0n) return amounts.map(() => 0);
  const floors = amounts.map((amount) => Number((amount * BPS) / total));
  return spreadRemainder(amounts, floors, total);
};

/**
 * @param {readonly bigint[]} amounts
 * @param {number[]} floors
 * @param {bigint} total
 */
const spreadRemainder = (amounts, floors, total) => {
  let remainder = 10_000 - floors.reduce((sum, value) => sum + value, 0);
  for (const item of rankFractions(amounts, total)) {
    if (remainder === 0) break;
    floors[item.index] = (floors[item.index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
};

/** Largest remainder first; ties go to the lowest index. @param {readonly bigint[]} amounts @param {bigint} total */
const rankFractions = (amounts, total) =>
  amounts
    .map((amount, index) => ({ index, amount, frac: (amount * BPS) % total }))
    .filter((item) => item.amount > 0n)
    .toSorted((left, right) => {
      if (left.frac === right.frac) return left.index - right.index;
      return left.frac > right.frac ? -1 : 1;
    });

/** @param {readonly BinAmount[]} bins @param {number} activeId @param {boolean} atOrAbove */
const sideBps = (bins, activeId, atOrAbove) => {
  const eligible = bins.filter((bin) =>
    atOrAbove ? bin.binId >= activeId : bin.binId <= activeId,
  );
  const bps = uniformBps(eligible.length);
  let cursor = 0;
  return bins.map((bin) => {
    const isInside = atOrAbove ? bin.binId >= activeId : bin.binId <= activeId;
    if (!isInside) return 0;
    const value = bps[cursor] ?? 0;
    cursor += 1;
    return value;
  });
};

/** @param {readonly bigint[]} amounts @param {bigint} budget @param {boolean} changed */
const encodedTotal = (amounts, budget, changed) => {
  const spent = amounts.reduce((sum, amount) => sum + amount, 0n);
  if (spent === 0n) return 0n;
  return changed ? spent : budget;
};

/** @param {BinAmount} bin @param {BinAmount | undefined} before */
const hasDifferentAmounts = (bin, before) =>
  before === undefined || bin.amountX !== before.amountX || bin.amountY !== before.amountY;

/**
 * @param {readonly (BinAmount | null)[]} fitted
 * @param {readonly BinAmount[]} provisional
 * @param {{ readonly amountX: bigint; readonly amountY: bigint; readonly activeId: number }} input
 * @returns {Encoded}
 */
export const encodeFitted = (fitted, provisional, input) => {
  if (fitted.includes(null)) return reject("bin price is outside the pinned math");
  const bins = /** @type {BinAmount[]} */ (fitted.filter((bin) => bin !== null));
  const changed = bins.some((bin, index) => hasDifferentAmounts(bin, provisional[index]));
  return {
    status: "ok",
    amountX: encodedTotal(
      bins.map((bin) => bin.amountX),
      input.amountX,
      changed,
    ),
    amountY: encodedTotal(
      bins.map((bin) => bin.amountY),
      input.amountY,
      changed,
    ),
    bins,
    distX: changed
      ? bpsFromAmounts(bins.map((bin) => bin.amountX))
      : sideBps(bins, input.activeId, true),
    distY: changed
      ? bpsFromAmounts(bins.map((bin) => bin.amountY))
      : sideBps(bins, input.activeId, false),
  };
};

/**
 * @param {{ amountX: bigint; amountY: bigint; bins: readonly BinAmount[]; distX: readonly number[]; distY: readonly number[] }} encoded
 * @param {number} binStep
 * @returns {DepositAllocation | null}
 */
export const allocationOf = (encoded, binStep) => {
  const rows = encoded.bins.flatMap((bin, index) => {
    const distributionX = encoded.distX[index] ?? 0;
    const distributionY = encoded.distY[index] ?? 0;
    if (distributionX === 0 && distributionY === 0) return [];
    return [
      {
        binId: bin.binId,
        distributionX,
        distributionY,
        amountX: (encoded.amountX * BigInt(distributionX)) / BPS,
        amountY: (encoded.amountY * BigInt(distributionY)) / BPS,
      },
    ];
  });
  return sumRows(encoded, rows, binStep);
};

/**
 * @param {{ amountX: bigint; amountY: bigint }} encoded
 * @param {readonly { binId: number; distributionX: number; distributionY: number; amountX: bigint; amountY: bigint }[]} rows
 * @param {number} binStep
 * @returns {DepositAllocation | null}
 */
const sumRows = (encoded, rows, binStep) => {
  let liquidity = 0n;
  let spentX = 0n;
  let spentY = 0n;
  for (const row of rows) {
    const shares = sharesForDeposit({
      binId: row.binId,
      binStep,
      amountX: row.amountX,
      amountY: row.amountY,
    });
    if (shares === null) return null;
    liquidity += shares;
    spentX += row.amountX;
    spentY += row.amountY;
  }
  return {
    amountX: encoded.amountX,
    amountY: encoded.amountY,
    bins: rows.map(({ binId, distributionX, distributionY }) => ({
      binId,
      distributionX,
      distributionY,
    })),
    spentX,
    spentY,
    liquidity,
  };
};
