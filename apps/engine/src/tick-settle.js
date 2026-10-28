// @ts-check
import { Effect } from "effect";

/**
 * @typedef {{
 *   readonly state: "settled" | "failed" | "in_flight";
 *   readonly signature?: string | null;
 *   readonly reason?: string;
 *   readonly remedy?: string;
 *   readonly details?: Readonly<Record<string, unknown>>;
 * }} ScriptedSettle
 * @typedef {(
 *   action: import("@solos-sh/actions").Action,
 * ) => Promise<ScriptedSettle> | ScriptedSettle} SettleAction
 */

/**
 * @param {{ intentId: string; action: import("@solos-sh/actions").Action }} input
 * @param {SettleAction} settleAction
 */
export const scriptedSettle = (input, settleAction) =>
  Effect.tryPromise({
    try: () => Promise.resolve(settleAction(input.action)),
    catch: () => new Error("scripted settle failed"),
  }).pipe(
    Effect.catchAll(() => Effect.succeed(failedSettle(input.intentId))),
    Effect.map((settled) => ({ ...settled, intentId: input.intentId })),
  );

/** @param {string} intentId */
const failedSettle = (intentId) => ({
  intentId,
  state: /** @type {const} */ ("failed"),
  reason: "scripted settle failed",
  remedy: "inspect the test settle hook",
});
