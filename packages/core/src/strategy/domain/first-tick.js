// @ts-check

/** Digits after the decimal point. No dot means a whole number. @param {string} value */
const fractionLength = (value) => {
  const dot = value.indexOf(".");
  if (dot < 0) return 0;
  return value.length - dot - 1;
};

/**
 * Scale a decimal string to an integer of `width` fractional digits. No digit is dropped
 * and no digit is rounded.
 * @param {string} value
 * @param {number} width
 */
const scaledUnits = (value, width) => {
  const [whole, frac = ""] = value.split(".", 2);
  return BigInt(`${whole}${frac.padEnd(width, "0")}`);
};

/**
 * Compare two decimal strings exactly. Positive when `left` is greater. Both sides are
 * scaled to the wider fractional length, so a difference past any fixed width still counts.
 * @param {string} left
 * @param {string} right
 */
const compareDecimal = (left, right) => {
  const width = Math.max(fractionLength(left), fractionLength(right));
  const delta = scaledUnits(left, width) - scaledUnits(right, width);
  if (delta === 0n) return 0;
  return delta > 0n ? 1 : -1;
};

/**
 * Actions a first tick would emit. A trailing trigger has no anchor yet, so it emits nothing.
 * Schedule emits its configured Actions. A price trigger emits its Action only when the
 * observed price is strictly above or strictly below the threshold. An exact match emits nothing.
 * @param {import("@solos-sh/actions").StrategyDraft} draft
 * @param {string | undefined} priceUsd
 */
export const firstTickActions = (draft, priceUsd) => {
  if (draft.kind === "schedule") return [...draft.params.actions];
  if (draft.kind === "trigger") return triggerActions(draft.params, priceUsd);
  return [];
};

/**
 * @param {import("@solos-sh/actions").TriggerParams} params
 * @param {string | undefined} priceUsd
 */
const triggerActions = (params, priceUsd) => {
  if (priceUsd === undefined || params.priceUsd === undefined) return [];
  const order = compareDecimal(priceUsd, params.priceUsd);
  const isMet = params.condition === "above" ? order > 0 : order < 0;
  return isMet ? [params.action] : [];
};
