// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { LiquidityInputInvalid } from "../domain/errors.js";
import { LiquidityExecuteDepositInputSchema } from "../domain/types.js";
import { toDepositAction, validateDepositInput } from "./validate-input.js";

/** @typedef {import("../domain/errors.js").LiquidityInputInvalid | import("../domain/errors.js").LiquidityUnsupportedProtocol | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError} ExecuteDepositError */

/**
 * Execute a deposit into one existing Orca or Raydium position through the configured executor
 * (ADR-0013): the intent becomes an `add_liquidity` Action and only the executor touches
 * RPC, signing and submission. The exact transaction that will be submitted is simulated
 * first unless `skipSimulation` is true; a failed simulation, a rejected build or an expired
 * blockhash sends nothing. Ambiguous submissions keep their signature in the structured
 * failure — confirmation is not proof of the requested economic fill.
 * @param {import("../domain/types.js").LiquidityExecuteDepositInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").ExecutionResult,
 *   ExecuteDepositError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeDeposit = (input) =>
  Effect.gen(function* () {
    const request = yield* validateDepositInput(LiquidityExecuteDepositInputSchema, input);
    const action = toDepositAction(request);
    if (action === null) {
      return yield* new LiquidityInputInvalid({
        reason: "the request does not satisfy the add_liquidity Action contract",
      });
    }
    return yield* executeAction({
      action,
      skipSimulation: request.skipSimulation === true,
      event: "liquidity.deposited",
    });
  }).pipe(Effect.withSpan("liquidity.executeDeposit"));
