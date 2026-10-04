// @ts-check
import { Effect } from "effect";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { LiquidityInputInvalid } from "../domain/errors.js";
import { LiquidityDepositInputSchema } from "../domain/types.js";
import { toDepositAction, validateDepositInput } from "./validate-input.js";
/** @typedef {import("../domain/errors.js").LiquidityInputInvalid | import("../domain/errors.js").LiquidityUnsupportedProtocol | import("../../shared/domain/errors.js").SimulationFailed | import("../../shared/ports/action-executor.js").ExecutorError} SimulateDepositError */

/**
 * Simulate adding liquidity to one existing Orca, Raydium, or Meteora position without sending anything: the
 * intent becomes an `add_liquidity` Action and the executor builds and simulates its own
 * fresh transaction — pool, position, custody and budgets are all re-checked against chain
 * state, and nothing is ever submitted. A later execute call re-plans and may differ.
 * @param {import("../domain/types.js").LiquidityDepositInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("@solos-sh/actions").SimulationResult,
 *   SimulateDepositError,
 *   import("../../shared/ports/action-executor.js").ActionExecutorShape
 * >}
 */
export const simulateDeposit = (input) =>
  Effect.gen(function* () {
    const request = yield* validateDepositInput(LiquidityDepositInputSchema, input);
    const action = toDepositAction(request);
    if (action === null) {
      return yield* new LiquidityInputInvalid({
        reason: "the request does not satisfy the add_liquidity Action contract",
      });
    }
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("liquidity.simulateDeposit"));
