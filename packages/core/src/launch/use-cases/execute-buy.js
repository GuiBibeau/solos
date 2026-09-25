// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { CurveInputInvalid } from "../domain/errors.js";
import { LaunchExecuteBuyInputSchema } from "../domain/types.js";
import { toBuyAction, validateBuyInput } from "./to-buy-action.js";

/** @typedef {import("../domain/errors.js").CurveInputInvalid | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError} ExecuteBuyError */

/**
 * Buy one pump.fun coin with a bounded SOL budget through the configured executor (ADR-0013):
 * the intent becomes a `swap` Action carrying `venue: "pump"` and only the executor touches RPC,
 * signing and submission.
 *
 * The exact transaction that will be submitted is simulated first unless `skipSimulation` is
 * true; a failed simulation, a rejected build, a completed curve or an expired blockhash sends
 * nothing. The minimum tokens the program must deliver is carried in the instruction, so a curve
 * that moves between planning and landing reverts rather than filling badly. Ambiguous
 * submissions keep their signature in the structured failure — confirmation is not proof of the
 * requested economic fill.
 *
 * There is no solOS Pump sell tool, so an operator must have a checked external exit route
 * before spending here.
 * @param {import("../domain/types.js").LaunchExecuteBuyInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").ExecutionResult,
 *   ExecuteBuyError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeBuy = (input) =>
  Effect.gen(function* () {
    const request = yield* validateBuyInput(LaunchExecuteBuyInputSchema, input);
    const action = toBuyAction(request);
    if (action === null) {
      return yield* new CurveInputInvalid({
        reason: "the request does not satisfy the swap Action contract for a pump buy",
      });
    }
    return yield* executeAction({
      action,
      skipSimulation: request.skipSimulation === true,
      event: "launch.bought",
    });
  }).pipe(Effect.withSpan("launch.executeBuy"));
