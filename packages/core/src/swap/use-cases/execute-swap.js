// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { toSwapAction } from "./to-action.js";
import { validateSwapInput } from "./validate-input.js";

/**
 * Execute a swap through the configured executor (ADR-0013): the intent becomes an Action and
 * the executor obtains its own fresh build — a quote read earlier is never an authorization, and
 * a separate simulate call and a later execute call may ride different fresh quotes. The exact
 * transaction that will be submitted is simulated first unless `skipSimulation` is true.
 * @param {import("../domain/types.js").SwapQuoteRequest & { skipSimulation?: boolean }} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").ExecutionResult,
 *   import("../domain/errors.js").QuoteInputInvalid | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeSwap = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSwapInput(input);
    return yield* executeAction({
      action: toSwapAction(request),
      skipSimulation: input.skipSimulation === true,
      event: "swap.executed",
    });
  }).pipe(Effect.withSpan("swap.executeSwap"));
