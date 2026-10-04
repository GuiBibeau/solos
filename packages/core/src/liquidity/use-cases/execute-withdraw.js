// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { LiquidityInputInvalid } from "../domain/errors.js";
import { LiquidityExecuteWithdrawInputSchema } from "../domain/types.js";
import { toWithdrawAction, validateWithdrawInput } from "./validate-input.js";

/** @typedef {import("../domain/errors.js").LiquidityInputInvalid | import("../domain/errors.js").LiquidityUnsupportedProtocol | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError} ExecuteWithdrawError */

/**
 * Execute a removal from one existing Orca, Raydium, or Meteora position through the configured
 * executor (ADR-0013): the intent becomes a `remove_liquidity` Action and only the executor
 * touches RPC, signing and submission. The exact transaction that will be submitted is
 * simulated first unless `skipSimulation` is true; a failed simulation, a rejected build or an
 * expired blockhash sends nothing. The position account is preserved — only liquidity leaves.
 * Ambiguous submissions keep their signature in the structured failure.
 * @param {import("../domain/types.js").LiquidityExecuteWithdrawInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").ExecutionResult,
 *   ExecuteWithdrawError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeWithdraw = (input) =>
  Effect.gen(function* () {
    const request = yield* validateWithdrawInput(LiquidityExecuteWithdrawInputSchema, input);
    const action = toWithdrawAction(request);
    if (action === null) {
      return yield* new LiquidityInputInvalid({
        reason: "the request does not satisfy the remove_liquidity Action contract",
      });
    }
    return yield* executeAction({
      action,
      skipSimulation: request.skipSimulation === true,
      event: "liquidity.withdrawn",
    });
  }).pipe(Effect.withSpan("liquidity.executeWithdraw"));
