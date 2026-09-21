// @ts-check
import { Effect } from "effect";
import { SimulationFailed } from "../../shared/domain/errors.js";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { toSwapAction } from "./to-action.js";
import { validateSwapInput } from "./validate-input.js";

/**
 * Simulate a swap without sending anything: the intent becomes an Action and the executor builds
 * and simulates its own fresh transaction. Nothing is ever submitted, and a later execute call
 * obtains a fresh quote that may differ from this one.
 * @param {import("../domain/types.js").SwapQuoteRequest} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").SimulationResult,
 *   import("../domain/errors.js").QuoteInputInvalid | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateSwap = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSwapInput(input);
    const result = yield* (yield* ActionExecutor).simulate(toSwapAction(request));
    if (!result.ok) {
      const reason = result.violations.map((v) => `${v.rule}: ${v.message}`).join("; ");
      return yield* new SimulationFailed({
        reason: reason || "simulation failed",
        logs: result.logs,
      });
    }
    return result;
  }).pipe(Effect.withSpan("swap.simulateSwap"));
