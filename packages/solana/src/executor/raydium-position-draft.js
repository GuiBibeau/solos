// @ts-check
/**
 * The draft of one assembled Raydium position instruction, under the local v1 budget.
 *
 * Shared by opening, closing, adding and removing. Submission's signing collects signers from
 * the instructions' own account metas (ADR-0032), so an ephemeral NFT mint signs because its
 * meta carries the signer — there is no second list of keys to keep in step with the accounts.
 */
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";

/** Local v1 budget for a Raydium liquidity instruction: room for two tick arrays and the ATAs. */
export const RAYDIUM_V1_CONFIG = Object.freeze({
  computeUnitLimit: 400_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

/**
 * @param {string} label
 * @param {readonly unknown[]} instructions
 * @returns {import("../submission/seal-draft.js").Draft}
 */
export const raydiumDraft = (label, instructions) => ({
  label,
  instructions: /** @type {any} */ (instructions),
  config: RAYDIUM_V1_CONFIG,
});

/**
 * Raydium is the only venue whose position lifecycle this encodes. The use cases gate on the
 * same list, but an Action can reach the executor from anywhere, and routing an orca open into
 * a Raydium build would report a venue the transaction never touched.
 * @param {string} actionType @param {string} protocol
 */
export const notRaydium = (actionType, protocol) =>
  Effect.fail(
    new UnsupportedAction({
      actionType: `${actionType}:${protocol}`,
      executor: "direct-signer",
      remedy: `pass protocol raydium to ${actionType}`,
    }),
  );
