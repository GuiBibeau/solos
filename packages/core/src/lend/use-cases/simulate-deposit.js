// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { LendingInputInvalid } from "../domain/errors.js";
import { LendDepositInputSchema } from "../domain/types.js";
import { LendingVenue } from "../ports/lending-venue.js";
import { toDepositAction, validateDepositInput } from "./validate-input.js";
/** @typedef {import("../domain/errors.js").LendingInputInvalid | import("../../shared/domain/errors.js").SimulationFailed | import("../../shared/ports/action-executor.js").ExecutorError} SimulateDepositError */

/**
 * Simulate supplying one exact underlying amount into the configured Kamino market without
 * sending anything: the intent becomes a `lend` Action carrying the venue's configured
 * market identity (ADR-0019), and the executor plans against live chain state — reserve,
 * obligation, funding account and balances are all re-checked, and nothing is ever
 * submitted. A later execute call re-plans and may differ.
 * @param {import("../domain/types.js").LendDepositInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").SimulationResult,
 *   SimulateDepositError,
 *   import("../ports/lending-venue.js").LendingVenueShape | import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateDeposit = (input) =>
  Effect.gen(function* () {
    const request = yield* validateDepositInput(LendDepositInputSchema, input);
    const venue = yield* LendingVenue;
    const action = toDepositAction(request, venue.market);
    if (action === null) {
      return yield* new LendingInputInvalid({
        reason: "the request does not satisfy the lend Action contract",
      });
    }
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("lend.simulateDeposit"));
