// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { CurveInputInvalid } from "../domain/errors.js";
import { LaunchBuyInputSchema } from "../domain/types.js";
import { toBuyAction, validateBuyInput } from "./to-buy-action.js";

/** @typedef {import("../domain/errors.js").CurveInputInvalid | import("../../shared/domain/errors.js").SimulationFailed | import("../../shared/ports/action-executor.js").ExecutorError} SimulateBuyError */

/**
 * Simulate buying one pump.fun coin with a bounded SOL budget, sending nothing.
 *
 * The intent becomes a `swap` Action carrying `venue: "pump"`, and the executor plans against
 * live curve state: reserves, the creator the vault is seeded from, the quote asset and the
 * completed flag are all re-read, and nothing is submitted. A later execute re-plans and may
 * differ.
 * @param {import("../domain/types.js").LaunchBuyInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos/actions").SimulationResult,
 *   SimulateBuyError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateBuy = (input) =>
  Effect.gen(function* () {
    const request = yield* validateBuyInput(LaunchBuyInputSchema, input);
    const action = toBuyAction(request);
    if (action === null) {
      return yield* new CurveInputInvalid({
        reason: "the request does not satisfy the swap Action contract for a pump buy",
      });
    }
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("launch.simulateBuy"));
