// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { toSwapAction } from "./to-action.js";
import { validateSwapInput } from "./validate-input.js";

/**
 * Simulate a swap without sending anything: the intent becomes an Action and the executor builds
 * and simulates its own fresh transaction. Nothing is ever submitted, and a later execute call
 * obtains a fresh quote that may differ from this one.
 * @param {import("../domain/types.js").SwapQuoteRequest} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").SimulationResult,
 *   import("../domain/errors.js").QuoteInputInvalid | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateSwap = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSwapInput(input);
    return yield* simulateAction({ action: toSwapAction(request) });
  }).pipe(Effect.withSpan("swap.simulateSwap"));
