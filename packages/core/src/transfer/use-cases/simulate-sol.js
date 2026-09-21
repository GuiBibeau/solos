// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { resolveRequest } from "./resolve-request.js";
import { toTransferAction } from "./to-action.js";

/**
 * Build and simulate a SOL transfer without sending it.
 * @param {import("../domain/types.js").TransferSolInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").SimulationResult,
 *   import("./resolve-request.js").ResolveError | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("./resolve-request.js").ResolveContext | import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateSol = (input) =>
  Effect.gen(function* () {
    const request = yield* resolveRequest(input);
    const result = yield* simulateAction({ action: toTransferAction(request) });
    return {
      from: request.from,
      to: request.to,
      lamports: request.lamports.toString(),
      unitsConsumed: result.unitsConsumed,
      logs: result.logs,
    };
  }).pipe(Effect.withSpan("transfer.simulateSol"));
