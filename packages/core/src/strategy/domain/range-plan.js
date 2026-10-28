// @ts-check

/**
 * @typedef {{
 *   readonly activeId?: number;
 *   readonly lowerBinId?: number;
 *   readonly upperBinId?: number;
 *   readonly amountA: string;
 *   readonly amountB: string;
 *   readonly instant: number;
 *   readonly params: import("@solos-sh/actions").RangeParams;
 *   readonly prior: import("./range-state.js").RangeState;
 *   readonly budget: { recentersToday: number; recenterDay: number };
 * }} View
 */

/**
 * @param {View} view
 * @param {{ streak: number; recentersToday: number; lastRecenterAt: number | null }} row
 */
export const snapshot = (view, row) => ({
  ...(view.activeId !== undefined && { activeId: view.activeId }),
  ...(view.lowerBinId !== undefined && { lowerBinId: view.lowerBinId }),
  ...(view.upperBinId !== undefined && { upperBinId: view.upperBinId }),
  position: view.params.position,
  outsideStreak: row.streak,
  recentersToday: row.recentersToday,
  recenterDay: view.budget.recenterDay,
  lastRecenterAt: row.lastRecenterAt,
  lastRecenterIntents: view.prior.lastRecenterIntents,
});

/**
 * @param {View} view
 * @param {{ lower: number; recentersToday: number; instant: number }} row
 */
export const moved = (view, row) => ({
  activeId: /** @type {number} */ (view.activeId),
  lowerBinId: row.lower,
  upperBinId: row.lower + view.params.width - 1,
  position: view.params.position,
  outsideStreak: 0,
  recentersToday: row.recentersToday,
  recenterDay: view.budget.recenterDay,
  lastRecenterAt: row.instant,
  lastRecenterIntents: view.prior.lastRecenterIntents,
});

/** @param {View} view */
export const depositAmounts = (view) => {
  if (!/[1-9]/.test(`${view.amountA}${view.amountB}`)) return { amountA: "1", amountB: "0" };
  return { amountA: view.amountA, amountB: view.amountB };
};

/**
 * @param {import("@solos-sh/actions").RangeParams} params
 * @param {number} lower
 * @param {{ amountA: string; amountB: string }} amounts
 */
export const recenterActions = (params, lower, amounts) => [
  {
    type: /** @type {const} */ ("remove_liquidity"),
    protocol: /** @type {const} */ ("meteora"),
    position: params.position,
    bps: 10_000,
    maxSlippageBps: params.maxSlippageBps,
  },
  {
    type: /** @type {const} */ ("close_position"),
    protocol: /** @type {const} */ ("meteora"),
    position: params.position,
  },
  {
    type: /** @type {const} */ ("open_position"),
    protocol: /** @type {const} */ ("meteora"),
    pool: params.pool,
    lowerBinId: lower,
    width: params.width,
    wrapSol: false,
  },
  {
    type: /** @type {const} */ ("add_liquidity"),
    protocol: /** @type {const} */ ("meteora"),
    pool: params.pool,
    position: params.position,
    amountA: amounts.amountA,
    amountB: amounts.amountB,
    maxSlippageBps: params.maxSlippageBps,
    wrapSol: false,
  },
];

/** @param {{ activeId?: number; lowerBinId?: number; upperBinId?: number }} observed */
export const insideNote = (observed) =>
  `active bin ${observed.activeId} is inside ${observed.lowerBinId}..${observed.upperBinId}`;

/** @param {View} view @param {number} streak */
export const waitNote = (view, streak) =>
  `active bin ${view.activeId} is outside ${view.lowerBinId}..${view.upperBinId} for ${streak} tick(s); recenters after ${view.params.recenterWhenOutsideFor}`;
