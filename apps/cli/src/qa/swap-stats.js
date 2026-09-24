// @ts-check
/** Pure summarising for the swap reliability report: percentiles and outcome tallies. */

/** @typedef {{ reason: string; ms: number }} Attempt */

/**
 * Nearest-rank percentile over whole milliseconds. Zero when nothing was attempted, which keeps
 * an empty pair readable rather than throwing.
 * @param {ReadonlyArray<number>} values
 * @param {number} percentile 0..1
 */
export const percentileMs = (values, percentile) => {
  if (values.length === 0) return 0;
  const sorted = [...values].toSorted((a, b) => a - b);
  const rank = Math.ceil(percentile * sorted.length);
  return Math.round(sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? 0);
};

/**
 * Every distinct outcome with its count, most frequent first, so the dominant failure is the
 * first thing read. Ties break by reason for a stable report.
 * @param {ReadonlyArray<Attempt>} attempts
 */
export const tallyOutcomes = (attempts) => {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const { reason } of attempts) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return Array.from(counts, ([reason, count]) => ({ reason, count })).toSorted(
    (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
  );
};

/**
 * Summarise one pair's attempts.
 * @param {ReadonlyArray<Attempt>} attempts
 */
export const summarise = (attempts) => {
  const durations = attempts.map(({ ms }) => ms);
  const ok = attempts.filter(({ reason }) => reason === "ok").length;
  return {
    attempts: attempts.length,
    ok,
    rate: attempts.length === 0 ? 0 : ok / attempts.length,
    p50Ms: percentileMs(durations, 0.5),
    p95Ms: percentileMs(durations, 0.95),
    outcomes: tallyOutcomes(attempts),
  };
};
