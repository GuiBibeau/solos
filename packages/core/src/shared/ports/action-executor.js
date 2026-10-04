// @ts-check
import { Context } from "effect";

/**
 * Errors any executor may raise. Policy failures use `BuildRejected` before signing; a signed
 * transaction that expires before submission uses `TransactionExpired`.
 * @typedef {import("../domain/errors.js").RpcError
 *   | import("../domain/errors.js").SimulationFailed
 *   | import("../domain/errors.js").TransactionFailed
 *   | import("../domain/errors.js").TransactionExpired
 *   | import("../domain/errors.js").UnsupportedAction
 *   | import("../domain/errors.js").BuildRejected
 *   | import("../domain/errors.js").BuildUnavailable
 *   | import("../domain/errors.js").SignerUnavailable
 *   | ExecutorDomainError} ExecutorError
 * Slice-owned executor failures use the open tagged-error seam; shared never imports a slice.
 * @typedef {import("effect/Cause").YieldableError & { readonly _tag: string }} ExecutorDomainError
 */

/**
 * The seam between deciding and acting (ADR-0013). The agent side builds an `Action`; whoever is
 * configured here turns it into a transaction: the local wallet by default, a vault engine later.
 * @typedef {{
 *   readonly name: string;
 *   readonly simulate: (action: import("@solos-sh/actions").Action) =>
 *     import("effect").Effect.Effect<import("@solos-sh/actions").SimulationResult, ExecutorError>;
 *   readonly execute: (action: import("@solos-sh/actions").Action, options: { readonly skipSimulation: boolean }) =>
 *     import("effect").Effect.Effect<import("@solos-sh/actions").ExecutionResult, ExecutorError>;
 * }} ActionExecutorShape
 */

export const ActionExecutor = /** @type {Context.Tag<ActionExecutorShape, ActionExecutorShape>} */ (
  Context.GenericTag("@solos/shared/ActionExecutor")
);
