// @ts-check

const FIELD = /^(\*|\d+|\*\/\d+|\d+-\d+)(,(\*|\d+|\*\/\d+|\d+-\d+))*$/;
const MINUTE_MS = 60_000;
const YEAR_MINUTES = 366 * 24 * 60;

/**
 * @typedef {{
 *   readonly minute: string;
 *   readonly hour: string;
 *   readonly dom: string;
 *   readonly month: string;
 *   readonly dow: string;
 * }} CronFields
 */

/** Five UTC cron fields, or undefined when the expression is not that shape. @param {string} expression */
export const parseCron = (expression) => {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 || parts.some((field) => !FIELD.test(field))) return undefined;
  const [minute, hour, dom, month, dow] = parts;
  if (minute === undefined || hour === undefined || dom === undefined) return undefined;
  if (month === undefined || dow === undefined) return undefined;
  return { minute, hour, dom, month, dow };
};

/**
 * The next UTC millisecond at or after `now` that matches. Undefined when the expression is
 * not five fields or no match exists within a year.
 * @param {string} expression
 * @param {number} now
 */
export const nextCronAt = (expression, now) => {
  const fields = parseCron(expression);
  if (!fields) return undefined;
  let cursor = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  if (cursor < now) cursor += MINUTE_MS;
  for (let step = 0; step < YEAR_MINUTES; step += 1) {
    if (matches(fields, cursor)) return cursor;
    cursor += MINUTE_MS;
  }
  return undefined;
};

/** Milliseconds between the first two matches, the tightest gap this expression allows. @param {string} expression */
export const cronGapMs = (expression) => {
  const first = nextCronAt(expression, 0);
  if (first === undefined) return undefined;
  const second = nextCronAt(expression, first + 1);
  if (second === undefined) return undefined;
  return second - first;
};

/** @param {CronFields} fields @param {number} instant */
const matches = (fields, instant) => {
  const date = new Date(instant);
  return (
    includes(fields.minute, date.getUTCMinutes(), 0) &&
    includes(fields.hour, date.getUTCHours(), 0) &&
    includes(fields.month, date.getUTCMonth() + 1, 1) &&
    dayMatches(fields, date)
  );
};

/** @param {CronFields} fields @param {Date} date */
const dayMatches = (fields, date) => {
  const dom = includes(fields.dom, date.getUTCDate(), 1);
  const dow = includes(fields.dow, date.getUTCDay(), 0);
  if (fields.dom !== "*" && fields.dow !== "*") return dom || dow;
  return dom && dow;
};

/**
 * @param {string} field
 * @param {number} value
 * @param {number} origin
 */
const includes = (field, value, origin) => {
  if (field === "*") return true;
  for (const token of field.split(",")) {
    if (tokenMatches(token, value, origin)) return true;
  }
  return false;
};

/** @param {string} token @param {number} value @param {number} origin */
const tokenMatches = (token, value, origin) => {
  const step = /^\*\/(\d+)$/.exec(token);
  if (step) return (value - origin) % Number(step[1]) === 0;
  const range = /^(\d+)-(\d+)$/.exec(token);
  if (range) return value >= Number(range[1]) && value <= Number(range[2]);
  if (value === 0 && token === "7") return true;
  return token === String(value);
};
