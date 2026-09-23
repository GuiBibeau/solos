// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { LendingInputInvalid } from "../domain/errors.js";
import { LendExecuteWithdrawInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";
import { toWithdrawAction, validateWithdrawInput } from "./validate-input.js";

/** @param {import("../domain/types.js").LendExecuteWithdrawInput} input */
export const executeWithdraw = (input) =>
  Effect.gen(function* () {
    const request = yield* validateWithdrawInput(LendExecuteWithdrawInputSchema, input);
    const venue = yield* LendingVenue;
    const action = toWithdrawAction(request, venue.market);
    if (action === null) {
      return yield* new LendingInputInvalid({ reason: "invalid Kamino withdrawal action" });
    }
    return yield* executeAction({
      action,
      skipSimulation: request.skipSimulation,
      event: "lend.withdrawn",
    });
  }).pipe(Effect.withSpan("lend.executeWithdraw"));
