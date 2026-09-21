// @ts-check
import { Effect } from "effect";
import { makeEvent } from "../../shared/domain/event.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { resolveRequest } from "./resolve-request.js";
import { toTransferAction } from "./to-action.js";

/**
 * Send SOL from the configured signer through whichever executor is configured (ADR-0013).
 * Simulates first unless told not to, then publishes `transfer.sent` with the slice's own
 * receipt: the executor's result is the contract's; the receipt is transfer's vocabulary.
 * @param {import("../domain/types.js").TransferSolInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").TransferReceipt,
 *   import("./resolve-request.js").ResolveError | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError,
 *   import("./resolve-request.js").ResolveContext | import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const sendSol = (input) =>
  Effect.gen(function* () {
    const request = yield* resolveRequest(input);
    const result = yield* executeAction({
      action: toTransferAction(request),
      skipSimulation: request.skipSimulation,
    });
    /** @type {import("../domain/types.js").TransferReceipt} */
    const receipt = {
      // executeAction's contract: a confirmed result always carries its signature.
      signature: /** @type {string} */ (result.signature),
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
