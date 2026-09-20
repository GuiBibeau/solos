// @ts-check
/**
 * Format one SDK APY as the snapshot's fractional decimal string. The SDK's APY methods
 * return JS numbers by documented contract (compound-per-slot math); `String()` is the
 * verbatim shortest round-trip of that number — the same practice the Jupiter price adapter
 * documents — adding no rounding of its own. Non-finite or negative values are not APYs:
 * they return null and the adapter fails `LendingResponseInvalid` instead of coercing.
 * @param {number} value
 * @returns {string | null}
 */
export const formatApy = (value) => {
  if (!Number.isFinite(value) || value < 0) return null;
  return String(value);
};
