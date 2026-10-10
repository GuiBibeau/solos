// @ts-check

/** @type {Record<string, number>} */
const UNIT = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

const PLAIN = /^(\d+)(ms|s|m|h)$/;
const ISO = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Milliseconds for a positive integer, a plain duration (`30s`, `5m`, `1h`), or an ISO-8601
 * duration (`PT1M`). Undefined when the text is not one of those.
 * @param {number | string} value
 * @returns {number | undefined}
 */
export const durationMs = (value) => {
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  const plain = PLAIN.exec(value);
  if (plain) return scaled(plain[1], UNIT[plain[2] ?? ""]);
  return isoMs(value);
};

/**
 * A short label for a millisecond count: `10s`, `1m`, `2h`, or the raw milliseconds.
 * @param {number} ms
 */
export const formatDuration = (ms) => {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
};

/** @param {string | undefined} amount @param {number | undefined} unit */
const scaled = (amount, unit) => {
  const count = Number(amount);
  if (unit === undefined || !Number.isSafeInteger(count) || count <= 0) return undefined;
  return count * unit;
};

/** @param {string} value */
const isoMs = (value) => {
  const match = ISO.exec(value);
  if (!match) return undefined;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return total > 0 ? total * 1000 : undefined;
};
