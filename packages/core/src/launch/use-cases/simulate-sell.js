// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { CurveInputInvalid } from "../domain/errors.js";
import { LaunchSellInputSchema } from "../domain/types.js";
import { toSellAction, validateSellInput } from "./to-buy-action.js";

/** @typedef {import("../domain/errors.js").CurveInputInvalid | import("../../shared/domain/errors.js").SimulationFailed | import("../../shared/ports/action-executor.js").ExecutorError} SimulateSellError */

/**
 * Simulate selling one pump.fun coin back to its bonding curve, sending nothing.
 *
 * The intent becomes a `swap` Action carrying `venue: "pump"` with the coin on the input side
 * and SOL on the output side — the same route identity as the buy, read in the other direction.
 * The executor re-reads live curve state and the wallet's own balance of the coin; a wallet that
 * does not hold what it is selling is refused here rather than on chain. A later execute
 * re-plans and may differ.
 * @param {import("../domain/types.js").LaunchSellInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").SimulationResult,
 *   SimulateSellError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateSell = (input) =>
  Effect.gen(function* () {
    const request = yield* validateSellInput(LaunchSellInputSchema, input);
    const action = toSellAction(request);
    if (action === null) {
      return yield* new CurveInputInvalid({
        reason: "the request does not satisfy the swap Action contract for a pump sell",
      });
    }
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("launch.simulateSell"));
