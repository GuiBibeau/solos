// @ts-check
import { isLiquidityAction } from "../domain/supported-action.js";

/**
 * Quote context for one liquidity action. A later add in the same tick is a redeposit.
 * @param {import("@solos-sh/actions").Action} action
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {readonly string[]} priorTypes
 */
export const quoteContext = (action, observations, priorTypes) => {
  if (!isLiquidityAction(action.type)) return undefined;
  const decimalsA = integer(observations.tokenADecimals);
  const decimalsB = integer(observations.tokenBDecimals);
  return {
    redeposit: priorTypes.includes("remove_liquidity"),
    ...(text(observations.valueUsd) !== undefined && { valueUsd: text(observations.valueUsd) }),
    ...(text(observations.tokenAMint) !== undefined && { mint: text(observations.tokenAMint) }),
    ...(text(observations.priceA) !== undefined && { priceA: text(observations.priceA) }),
    ...(text(observations.priceB) !== undefined && { priceB: text(observations.priceB) }),
    ...(decimalsA !== undefined && { decimalsA }),
    ...(decimalsB !== undefined && { decimalsB }),
  };
};

/**
 * Copy withdrawn amounts onto later deposits. Both zero drops the deposit.
 * @param {(import("@solos-sh/actions").Action | undefined)[]} actions
 * @param {number} from
 * @param {{ readonly amountA: string; readonly amountB: string } | undefined} amounts
 */
export const applyWithdrawal = (actions, from, amounts) => {
  if (amounts === undefined) return;
  for (let index = from; index < actions.length; index += 1) {
    const action = actions[index];
    if (action?.type !== "add_liquidity") continue;
    actions[index] = nextDeposit(action, amounts);
  }
};

/**
 * Point later deposits at the position account open just created.
 * @param {(import("@solos-sh/actions").Action | undefined)[]} actions
 * @param {number} from
 * @param {string} position
 */
export const applyPosition = (actions, from, position) => {
  for (let index = from; index < actions.length; index += 1) {
    const action = actions[index];
    if (action?.type !== "add_liquidity") continue;
    actions[index] = { ...action, position };
  }
};

/**
 * @param {{ index: number; action: import("@solos-sh/actions").Action; intentId: string; reason?: string }} step
 */
export const stepFailure = (step) =>
  `step ${step.index} ${step.action.type} (${step.intentId}) failed: ${step.reason ?? "the step did not settle"}`;

/** @param {unknown} value */
export const amountPair = (value) => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = /** @type {{ amountA?: unknown; amountB?: unknown }} */ (value);
  if (typeof row.amountA !== "string" || typeof row.amountB !== "string") return undefined;
  if (!/^\d+$/.test(row.amountA) || !/^\d+$/.test(row.amountB)) return undefined;
  return { amountA: row.amountA, amountB: row.amountB };
};

/** @param {unknown} value */
export const openedPosition = (value) => {
  if (typeof value !== "object" || value === null) return undefined;
  const position = /** @type {{ position?: unknown }} */ (value).position;
  return typeof position === "string" && position.length > 0 ? position : undefined;
};

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {{ readonly amountA: string; readonly amountB: string }} amounts
 * @returns {import("@solos-sh/actions").Action | undefined}
 */
const nextDeposit = (action, amounts) => {
  if (action.type !== "add_liquidity") return action;
  if (amounts.amountA === "0" && amounts.amountB === "0") return undefined;
  return { ...action, amountA: amounts.amountA, amountB: amounts.amountB };
};

/** @param {unknown} value */
const text = (value) => (typeof value === "string" && value.length > 0 ? value : undefined);

/** @param {unknown} value */
const integer = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 18
    ? value
    : undefined;
