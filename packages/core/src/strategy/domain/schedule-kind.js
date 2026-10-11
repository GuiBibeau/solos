// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";

/** What a schedule Tick reads: the signer's lamports and the Tick's instant. */
export const SCHEDULE_OBSERVATIONS = ["lamports", "instant"];

const FEE_LAMPORTS = 10_000n;
const ATA_RENT_LAMPORTS = 2_039_280n;

/**
 * @typedef {{
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly state: unknown;
 *   readonly note: string;
 *   readonly failure?: { readonly reason: string; readonly remedy: string };
 * }} KindDecision
 */

/**
 * Pure schedule evaluation. Too little SOL to fund the Actions and their fee is a failure the
 * runner records, so the Tick never reaches a simulation.
 * @param {import("@solos-sh/actions").ScheduleParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} state
 * @returns {KindDecision}
 */
export const evaluateSchedule = (params, observations, state) => {
  const needed = requiredLamports(params.actions);
  const have = BigInt(String(observations.lamports ?? "0"));
  if (have >= needed) return { actions: params.actions, state, note: "schedule is due" };
  return {
    actions: params.actions,
    state,
    note: "the signer balance cannot fund the swap and its fee",
    failure: {
      reason: `signer has ${have.toString()} lamports and this tick needs ${needed.toString()}`,
      remedy: "fund the signer with enough SOL for the swap and its fee",
    },
  };
};

/** @param {ReadonlyArray<import("@solos-sh/actions").Action>} actions */
const requiredLamports = (actions) => {
  let total = FEE_LAMPORTS * BigInt(actions.length);
  for (const action of actions) total += actionLamports(action);
  return total;
};

/** @param {import("@solos-sh/actions").Action} action */
const actionLamports = (action) => {
  if (action.type === "transfer_sol") return BigInt(action.lamports);
  if (action.type === "swap" && requiresSol(action))
    return BigInt(action.amount) + ATA_RENT_LAMPORTS;
  return 0n;
};

/** @param {import("@solos-sh/actions").SwapAction} action */
const requiresSol = (action) => action.inputMint === WSOL_MINT;
