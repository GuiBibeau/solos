// @ts-check
/**
 * Route an open or a close to the protocol that can build it.
 *
 * Raydium keeps its tick-range open and its NFT close. Meteora opens an empty position at the
 * caller's bin window and closes that PositionV2 account. Both opens report the position account
 * they created, so a Caller can act on it without enumerating: Meteora's PositionV2 (its
 * ephemeral key never leaves the signer, only the pubkey does) and Raydium's personal position.
 */
import { Effect } from "effect";
import { draftMeteoraClose } from "./meteora-close-build.js";
import { draftMeteoraOpen, meteoraOpenQuoteOf } from "./meteora-open-build.js";
import { draftRaydiumClose } from "./raydium-close-build.js";
import { openQuoteOf } from "./raydium-open-quote.js";
import { draftRaydiumOpen } from "./raydium-position-build.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("../submission/seal-draft.js").Draft} Draft */

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {import("@solos-sh/actions").OpenPositionAction} action
 */
export const plannedOpen = ({ ctx, kit }, action) => {
  if (action.protocol === "meteora") {
    return Effect.map(draftMeteoraOpen({ ctx, kit }, action), ({ draft, plan }) => ({
      draft,
      venueQuote: meteoraOpenQuoteOf(action, plan),
      position: plan.position,
    }));
  }
  return Effect.map(draftRaydiumOpen({ ctx, kit }, action), ({ draft, plan }) => ({
    draft,
    venueQuote: openQuoteOf(action, plan),
    position: plan.position,
  }));
};

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {import("@solos-sh/actions").ClosePositionAction} action
 * @returns {import("effect").Effect.Effect<Draft, import("@solos/core").ExecutorError>}
 */
export const plannedClose = ({ ctx, kit }, action) => {
  const built =
    action.protocol === "meteora"
      ? draftMeteoraClose({ ctx, kit }, action)
      : draftRaydiumClose({ ctx, kit }, action);
  return Effect.map(built, ({ draft }) => draft);
};
