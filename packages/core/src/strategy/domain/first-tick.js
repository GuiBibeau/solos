// @ts-check

/**
 * Compare two non-negative decimal strings. Positive when `left` is greater.
 * @param {string} left
 * @param {string} right
 */
/** @param {string | undefined} left @param {string | undefined} right */
const compareWhole = (left, right) => {
  const delta = BigInt(left ?? "0") - BigInt(right ?? "0");
  if (delta === 0n) return 0;
  return delta > 0n ? 1 : -1;
};

/** @param {string} left @param {string} right */
const compareFrac = (left, right) => {
  const width = 18;
  const frac = left.padEnd(width, "0").slice(0, width);
  const other = right.padEnd(width, "0").slice(0, width);
  if (frac === other) return 0;
  return frac > other ? 1 : -1;
};

/** @param {string} left @param {string} right */
const compareDecimal = (left, right) => {
  const [leftWhole, leftFrac = ""] = left.split(".", 2);
  const [rightWhole, rightFrac = ""] = right.split(".", 2);
  const whole = compareWhole(leftWhole, rightWhole);
  if (whole !== 0) return whole;
  return compareFrac(leftFrac, rightFrac);
};

/**
 * Actions a first tick would emit. A trailing trigger has no anchor yet, so it emits nothing.
 * Schedule emits its configured Actions. A price trigger emits its Action only when the
 * observed price already meets the condition.
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
  const isMet = params.condition === "above" ? order >= 0 : order <= 0;
  return isMet ? [params.action] : [];
};
