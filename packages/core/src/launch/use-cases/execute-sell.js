// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { CurveInputInvalid } from "../domain/errors.js";
import { LaunchExecuteSellInputSchema } from "../domain/types.js";
import { toSellAction, validateSellInput } from "./to-buy-action.js";

/** @typedef {import("../domain/errors.js").CurveInputInvalid | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError} ExecuteSellError */

/**
 * Sell one pump.fun coin back to its bonding curve through the configured executor (ADR-0013):
 * the intent becomes a `swap` Action carrying `venue: "pump"` with the coin in and SOL out, and
 * only the executor touches RPC, signing and submission.
 *
 * The exact transaction that will be submitted is simulated first unless `skipSimulation` is
 * true; a failed simulation, a rejected build, a completed curve, a balance short of the amount
 * or an expired blockhash sends nothing. The least SOL the program may return is carried in the
 * instruction, so a curve that moves between planning and landing reverts rather than filling
 * badly. Ambiguous submissions keep their signature in the structured failure — confirmation is
 * not proof of the requested economic fill.
 *
 * This is the curve-side exit for a coin bought here. A curve that has completed no longer
 * trades on the curve at all, and the sell is never rerouted to PumpSwap or Jupiter.
 * @param {import("../domain/types.js").LaunchExecuteSellInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").ExecutionResult,
 *   ExecuteSellError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeSell = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSellInput(LaunchExecuteSellInputSchema, input);
    const action = toSellAction(request);
    if (action === null) {
      return yield* new CurveInputInvalid({
        reason: "the request does not satisfy the swap Action contract for a pump sell",
      });
    }
    return yield* executeAction({
      action,
      skipSimulation: request.skipSimulation === true,
      event: "launch.sold",
    });
  }).pipe(Effect.withSpan("launch.executeSell"));
