// @ts-check
import { Effect } from "effect";
import { SimulationFailed } from "../domain/errors.js";
import { ActionExecutor } from "../ports/action-executor.js";

/**
 * Simulate one built Action through the configured executor (ADR-0013) and hold it to its
 * contract: a not-ok simulation is a typed `SimulationFailed` whose reason joins every
 * violation as `rule: message`, with the executor's logs carried along. Nothing is ever sent.
 * @param {{ readonly action: import("@solos-sh/actions").Action }} request
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").SimulationResult,
 *   SimulationFailed | import("../ports/action-executor.js").ExecutorError,
 *   import("../ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateAction = (request) =>
  Effect.flatMap(ActionExecutor, (executor) =>
    Effect.flatMap(executor.simulate(request.action), (result) => {
      if (result.ok) return Effect.succeed(result);
      const reason = result.violations.map((v) => `${v.rule}: ${v.message}`).join("; ");
      return Effect.fail(
        new SimulationFailed({ reason: reason || "simulation failed", logs: result.logs }),
      );
    }),
  ).pipe(Effect.withSpan("action.simulate"));
