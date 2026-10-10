// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly state: "missing" | "in_flight" | "settled" | "failed";
 *   readonly signature?: string | null;
 *   readonly reason?: string;
 * }} IntentView
 */

/**
 * The Intent row after startup recovery has already looked the signature up.
 * @typedef {{
 *   readonly lookup: (intentId: string) => import("effect").Effect.Effect<IntentView>;
 * }} IntentLookupShape
 */

export const IntentLookup = /** @type {Context.Tag<IntentLookupShape, IntentLookupShape>} */ (
  Context.GenericTag("@solos/strategy/IntentLookup")
);
