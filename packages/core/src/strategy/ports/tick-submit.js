// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly intentId: string;
 *   readonly state: "in_flight" | "settled" | "failed";
 *   readonly signature?: string | null;
 *   readonly reason?: string;
 *   readonly remedy?: string;
 *   readonly feeUsd?: string;
 * }} SubmitResult
 */

/**
 * Sends one Action through the Engine executor and the Intent store. Claiming the Intent
 * happens before broadcast.
 * @typedef {{
 *   readonly submit: (input: {
 *     readonly intentId: string;
 *     readonly action: import("@solos-sh/actions").Action;
 *   }) => import("effect").Effect.Effect<SubmitResult>;
 * }} TickSubmitShape
 */

export const TickSubmit = /** @type {Context.Tag<TickSubmitShape, TickSubmitShape>} */ (
  Context.GenericTag("@solos/strategy/TickSubmit")
);
