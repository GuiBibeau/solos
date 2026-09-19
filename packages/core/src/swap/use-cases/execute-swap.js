// @ts-check
import { Effect } from "effect";
import { TransactionFailed } from "../../shared/domain/errors.js";
import { makeEvent } from "../../shared/domain/event.js";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { toSwapAction } from "./to-action.js";
import { validateSwapInput } from "./validate-input.js";

/**
 * Execute a swap through the configured executor (ADR-0013): the intent becomes an Action and
 * the executor obtains its own fresh build — a quote read earlier is never an authorization, and
 * a separate simulate call and a later execute call may ride different fresh quotes. The exact
 * transaction that will be submitted is simulated first unless `skipSimulation` is true.
 * @param {import("../domain/types.js").SwapQuoteRequest & { skipSimulation?: boolean }} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").SwapExecution,
 *   import("../domain/errors.js").QuoteInputInvalid | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeSwap = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSwapInput(input);
    const executor = yield* ActionExecutor;
    const result = yield* executor.execute(toSwapAction(request), {
      skipSimulation: input.skipSimulation === true,
    });
    if (result.status !== "confirmed" || result.signature === null) {
      return yield* new TransactionFailed({
        signature: result.signature,
        reason: result.error ?? `executor ${executor.name} returned ${result.status}`,
      });
    }
    /** @type {import("../domain/types.js").SwapExecution} */
    const receipt = {
      signature: result.signature,
      simulated: result.simulated,
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      maxSlippageBps: request.slippageBps,
    };
    yield* (yield* EventBus).publish(makeEvent("swap.executed", receipt));
    return receipt;
  }).pipe(Effect.withSpan("swap.executeSwap"));
