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
 * The grouping key for one outcome: its text with every run of digits collapsed.
 *
 * A v1 policy clause reports what it observed against what it allows (#124), so two occurrences
 * of one clause differ in their numbers. Grouping on the raw text would split a recurring clause
 * into a column of count-1 rows and bury it, which is the opposite of what naming it achieved.
 * @param {string} reason
 */
const outcomeKey = (reason) => reason.replaceAll(/\d+/g, "#");

/**
 * Every distinct outcome with its count, most frequent first, so the dominant failure is the
 * first thing read. Ties break by the grouping key, which is stable across runs; the first-seen
 * sample is not, because which attempt failed first varies.
 *
 * `reason` is the collapsed clause, because that is what the count is a count *of* — reporting a
 * count of three beside one sample's numbers would say three attempts hit 4200 bytes when one
 * did. `example` carries a verbatim occurrence so the observed values survive the grouping.
 * @param {ReadonlyArray<Attempt>} attempts
 */
export const tallyOutcomes = (attempts) => {
  /** @typedef {{ reason: string; count: number; example: string }} Row */
  /** @type {Row[]} */
  const rows = [];
  /** @type {Map<string, Row>} */
  const byClause = new Map();
  for (const { reason } of attempts) {
    const key = outcomeKey(reason);
    const row = byClause.get(key);
    if (row === undefined) {
      /** @type {Row} */
      const fresh = { reason: key, count: 1, example: reason };
      byClause.set(key, fresh);
      rows.push(fresh);
    } else row.count += 1;
  }
  return rows.toSorted((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
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
