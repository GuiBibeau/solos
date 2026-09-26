// @ts-check
/**
 * The bin window `initialize_position` will accept. Width is the caller's. An illegal window is
 * refused whole — nothing here rounds it down to 70 or slides it back inside the bin-id range.
 *
 * Constants are the pinned program's (`commons/src/constants.rs` at 576919e3): bin ids
 * -443636..443636, and a base position of at most 70 bins. A wider account is an extended
 * position, which this open does not create.
 */

export const METEORA_MIN_BIN_ID = -443_636;
export const METEORA_MAX_BIN_ID = 443_636;
export const METEORA_POSITION_WIDTH_MAX = 70;

export const METEORA_EMPTY_OPEN =
  "meteora open is empty: pass lowerBinId and width, not a tick range or token budget";

/**
 * Why this bin window cannot be opened, or null when it is a legal `initialize_position`.
 * @param {unknown} lowerBinId
 * @param {unknown} width
 * @returns {string | null}
 */
export const meteoraWidthIssue = (lowerBinId, width) => {
  if (!Number.isSafeInteger(lowerBinId) || !Number.isSafeInteger(width)) {
    return "meteora open needs an integer lowerBinId and width";
  }
  return widthBounds(/** @type {number} */ (lowerBinId), /** @type {number} */ (width));
};

/**
 * @param {number} lowerBinId
 * @param {number} width
 * @returns {string | null}
 */
const widthBounds = (lowerBinId, width) => {
  if (width < 1 || width > METEORA_POSITION_WIDTH_MAX) {
    return (
      `width ${width} is not a legal Meteora position width ` +
      `(1..${METEORA_POSITION_WIDTH_MAX}); it was refused, not clamped`
    );
  }
  if (lowerBinId < METEORA_MIN_BIN_ID || lowerBinId > METEORA_MAX_BIN_ID) {
    return `lowerBinId ${lowerBinId} is outside ${METEORA_MIN_BIN_ID}..${METEORA_MAX_BIN_ID}`;
  }
  return upperBinIssue(lowerBinId, width);
};

/**
 * @param {number} lowerBinId
 * @param {number} width
 * @returns {string | null}
 */
const upperBinIssue = (lowerBinId, width) => {
  const upperBinId = lowerBinId + width - 1;
  if (upperBinId <= METEORA_MAX_BIN_ID) return null;
  return (
    `width ${width} from lowerBinId ${lowerBinId} ends at bin ${upperBinId}, ` +
    `past ${METEORA_MAX_BIN_ID}; it was refused, not clamped`
  );
};

/** @param {Record<string, unknown>} value @returns {string | null} */
const raydiumOpenIssue = (value) => {
  if (value.protocol !== "raydium") return null;
  if (value.lowerBinId !== undefined || value.width !== undefined) {
    return "raydium open takes a tick range, not lowerBinId and width";
  }
  return raydiumRangeIssue(value) ?? raydiumBudgetIssue(value);
};

/** @param {Record<string, unknown>} value @returns {string | null} */
const raydiumRangeIssue = (value) => {
  const { tickLower, tickUpper } = value;
  if (typeof tickLower !== "number" || typeof tickUpper !== "number" || tickLower >= tickUpper) {
    return "tickLower must be strictly below tickUpper";
  }
  return null;
};

/** @param {Record<string, unknown>} value @returns {string | null} */
const raydiumBudgetIssue = (value) => {
  const { amountA, amountB } = value;
  const budgets = `${typeof amountA === "string" ? amountA : ""}${typeof amountB === "string" ? amountB : ""}`;
  if (typeof amountA !== "string" || typeof amountB !== "string" || !/[1-9]/.test(budgets)) {
    return "at least one token spend budget must be positive";
  }
  if (value.maxSlippageBps === undefined) return "raydium open needs maxSlippageBps";
  return null;
};

/** @param {Record<string, unknown>} value @returns {string | null} */
const meteoraOpenIssue = (value) => {
  if (value.protocol !== "meteora") return null;
  if (
    value.tickLower !== undefined ||
    value.tickUpper !== undefined ||
    value.amountA !== undefined ||
    value.amountB !== undefined
  ) {
    return METEORA_EMPTY_OPEN;
  }
  return meteoraWidthIssue(value.lowerBinId, value.width);
};

/**
 * The first reason an open intent is not a legal position, or null when the protocol-specific
 * fields are acceptable. Address shape stays with the schema.
 * @param {unknown} value
 * @returns {string | null}
 */
export const openPositionIssue = (value) => {
  if (typeof value !== "object" || value === null) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  return raydiumOpenIssue(record) ?? meteoraOpenIssue(record);
};
