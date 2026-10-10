// @ts-check

/**
 * Deterministic Intent id for one Action of one Tick. The same strategy, tick, and step always
 * produce the same id, so a restarted Tick claims the Intent the first attempt already stored.
 * @param {string} strategyId
 * @param {string} tickId
 * @param {number} step
 */
export const intentIdFor = (strategyId, tickId, step) => `${strategyId}.${tickId}.${step}`;
