// @ts-check
import { Effect } from "effect";
import { TransactionFailed } from "../../shared/domain/errors.js";
import { makeEvent } from "../../shared/domain/event.js";
import { ActionExecutor } from "../../shared/ports/action-executor.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { resolveRequest } from "./resolve-request.js";
import { toTransferAction } from "./to-action.js";

/**
 * Send SOL from the configured signer through whichever executor is configured (ADR-0013).
 * Simulates first unless told not to, then publishes `transfer.sent`.
 * @param {import("../domain/types.js").TransferSolInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").TransferReceipt,
 *   import("./resolve-request.js").ResolveError | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("./resolve-request.js").ResolveContext | import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const sendSol = (input) =>
  Effect.gen(function* () {
    const request = yield* resolveRequest(input);
    const executor = yield* ActionExecutor;
    const result = yield* executor.execute(toTransferAction(request), {
      skipSimulation: request.skipSimulation,
    });
    if (result.status !== "confirmed" || result.signature === null) {
      return yield* new TransactionFailed({
        signature: result.signature,
        reason: result.error ?? `executor ${executor.name} returned ${result.status}`,
      });
    }
    /** @type {import("../domain/types.js").TransferReceipt} */
    const receipt = {
      signature: result.signature,
      from: request.from,
      to: request.to,
      lamports: request.lamports.toString(),
      simulated: result.simulated,
    };
    yield* (yield* EventBus).publish(makeEvent("transfer.sent", receipt));
    yield* Effect.logInfo("transfer.sent").pipe(
      Effect.annotateLogs({ signature: receipt.signature, lamports: receipt.lamports }),
    );
    return receipt;
  }).pipe(Effect.withSpan("transfer.sendSol"));
