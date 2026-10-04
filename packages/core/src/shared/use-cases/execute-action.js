// @ts-check
import { Effect } from "effect";
import { TransactionFailed } from "../domain/errors.js";
import { makeEvent } from "../domain/event.js";
import { ActionExecutor } from "../ports/action-executor.js";
import { EventBus } from "../ports/event-bus.js";

/**
 * Run one built Action through the configured executor (ADR-0013) and hold it to its
 * contract: only a confirmed result with a signature counts as executed — anything else is a
 * typed `TransactionFailed` that keeps the signature when one exists, because confirmation is
 * not proof of the requested economic fill. An optional dotted event name publishes the
 * confirmed result on the EventBus, so every execute-tier use case announces success alike.
 * @param {{
 *   readonly action: import("@solos-sh/actions").Action;
 *   readonly skipSimulation?: boolean;
 *   readonly event?: string;
 * }} request
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").ExecutionResult,
 *   TransactionFailed | import("../ports/action-executor.js").ExecutorError,
 *   import("../ports/action-executor.js").ActionExecutorShape | import("../ports/event-bus.js").EventBusShape
 * >}
 */
export const executeAction = (request) => {
  const { action, event } = request;
  return Effect.flatMap(ActionExecutor, (executor) =>
    Effect.flatMap(
      executor.execute(action, { skipSimulation: request.skipSimulation === true }),
      (result) => {
        if (result.status !== "confirmed" || result.signature === null) {
          return Effect.fail(
            new TransactionFailed({
              signature: result.signature,
              reason: result.error ?? `executor ${executor.name} returned ${result.status}`,
            }),
          );
        }
        if (event === undefined) return Effect.succeed(result);
        return Effect.as(
          Effect.flatMap(EventBus, (bus) => bus.publish(makeEvent(event, result))),
          result,
        );
      },
    ),
  ).pipe(Effect.withSpan("action.execute"));
};
