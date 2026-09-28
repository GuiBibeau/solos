// @ts-check
/**
 * The draft of one Meteora position instruction, under the local v1 budget.
 *
 * Opening admits a second signer: the ephemeral position key lives on its account meta, and
 * Submission's signing collects it from there (ADR-0032). The key is not stored, reused, or
 * logged. Closing signs with the fee payer alone.
 */
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";

/** Same local budget as a Meteora deposit, and the pinned CLI's close compute limit. */
export const METEORA_POSITION_V1_CONFIG = Object.freeze({
  computeUnitLimit: 1_400_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

/**
 * @param {string} label
 * @param {readonly unknown[]} instructions
 * @returns {import("../submission/seal-draft.js").Draft}
 */
export const meteoraPositionDraft = (label, instructions) => ({
  label,
  instructions: /** @type {any} */ (instructions),
  config: METEORA_POSITION_V1_CONFIG,
});

/**
 * @param {string} actionType
 * @param {string} protocol
 */
export const notMeteora = (actionType, protocol) =>
  Effect.fail(
    new UnsupportedAction({
      actionType: `${actionType}:${protocol}`,
      executor: "direct-signer",
      remedy: `pass protocol meteora to ${actionType}`,
    }),
  );
