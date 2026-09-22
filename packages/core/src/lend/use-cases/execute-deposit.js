// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { LendingInputInvalid } from "../domain/errors.js";
import { LendExecuteDepositInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";
import { toDepositAction, validateDepositInput } from "./validate-input.js";

/** @typedef {import("../domain/errors.js").LendingInputInvalid | import("../../shared/domain/errors.js").TransactionFailed | import("../../shared/ports/action-executor.js").ExecutorError} ExecuteDepositError */

/**
 * Execute a deposit into the configured Kamino market through the configured executor
 * (ADR-0013): the intent becomes a `lend` Action and only the executor touches RPC, signing
 * and submission. The exact transaction that will be submitted is simulated first unless
 * `skipSimulation` is true; a failed simulation, a rejected build or an expired blockhash
 * sends nothing. Ambiguous submissions keep their signature in the structured failure —
 * confirmation is not proof of the requested economic fill. Live funding stays the
 * operator's decision until the matching withdrawal exists and is checked (ADR-0019).
 * @param {import("../domain/types.js").LendExecuteDepositInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").ExecutionResult,
 *   ExecuteDepositError,
 *   import("../ports/lending-venue.js").LendingVenueShape | import("../../shared/ports/action-executor.js").ActionExecutorShape | import("../../shared/ports/event-bus.js").EventBusShape
 * >}
 */
export const executeDeposit = (input) =>
  Effect.gen(function* () {
    const request = yield* validateDepositInput(LendExecuteDepositInputSchema, input);
    const venue = yield* LendingVenue;
    const action = toDepositAction(request, venue.market);
    if (action === null) {
      return yield* new LendingInputInvalid({
        reason: "the request does not satisfy the lend Action contract",
      });
    }
    return yield* executeAction({
      action,
      skipSimulation: request.skipSimulation === true,
      event: "lend.deposited",
    });
  }).pipe(Effect.withSpan("lend.executeDeposit"));
