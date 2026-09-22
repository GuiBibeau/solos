// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { LiquidityInputInvalid } from "../domain/errors.js";
import { LiquidityWithdrawInputSchema } from "../domain/types.js";
import { toWithdrawAction, validateWithdrawInput } from "./validate-input.js";
/** @typedef {import("../domain/errors.js").LiquidityInputInvalid | import("../domain/errors.js").LiquidityUnsupportedProtocol | import("../../shared/domain/errors.js").SimulationFailed | import("../../shared/ports/action-executor.js").ExecutorError} SimulateWithdrawError */

/**
 * Simulate removing liquidity from one existing Orca position without sending anything: the
 * intent becomes a `remove_liquidity` Action and the executor plans against live chain
 * state — position liquidity, pool price, custody — and simulates the exact transaction it
 * would submit. Nothing is ever sent, and a later execute re-plans and may differ.
 * @param {import("../domain/types.js").LiquidityWithdrawInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").SimulationResult,
 *   SimulateWithdrawError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateWithdraw = (input) =>
  Effect.gen(function* () {
    const request = yield* validateWithdrawInput(LiquidityWithdrawInputSchema, input);
    const action = toWithdrawAction(request);
    if (action === null) {
      return yield* new LiquidityInputInvalid({
        reason: "the request does not satisfy the remove_liquidity Action contract",
      });
    }
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("liquidity.simulateWithdraw"));
