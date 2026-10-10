// @ts-check
import { compareDecimal } from "./decimal.js";

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
