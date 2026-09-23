// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { LendingInputInvalid } from "../domain/errors.js";
import { LendWithdrawInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";
import { toWithdrawAction, validateWithdrawInput } from "./validate-input.js";

/** @param {import("../domain/types.js").LendWithdrawInput} input */
export const simulateWithdraw = (input) =>
  Effect.gen(function* () {
    const request = yield* validateWithdrawInput(LendWithdrawInputSchema, input);
    const venue = yield* LendingVenue;
    const action = toWithdrawAction(request, venue.market);
    if (action === null) {
      return yield* new LendingInputInvalid({ reason: "invalid Kamino withdrawal action" });
    }
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("lend.simulateWithdraw"));
