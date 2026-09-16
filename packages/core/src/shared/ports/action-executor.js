// @ts-check
import { Context } from "effect";

/**
 * Errors any executor may raise. Wallet-mode adapters raise the first three; an engine adapter
 * adds its own rejection later without changing this port's callers.
 * @typedef {import("../domain/errors.js").RpcError
 *   | import("../domain/errors.js").SimulationFailed
 *   | import("../domain/errors.js").TransactionFailed
 *   | import("../domain/errors.js").UnsupportedAction} ExecutorError
 */

/**
 * The seam between deciding and acting (ADR-0013). The agent side builds an `Action`; whoever is
 * configured here turns it into a transaction: the local wallet by default, a vault engine later.
 * @typedef {{
 *   readonly name: string;
 *   readonly simulate: (action: import("@solos/actions").Action) =>
 *     import("effect").Effect.Effect<import("@solos/actions").SimulationResult, ExecutorError>;
 *   readonly execute: (action: import("@solos/actions").Action, options: { readonly skipSimulation: boolean }) =>
 *     import("effect").Effect.Effect<import("@solos/actions").ExecutionResult, ExecutorError>;
 * }} ActionExecutorShape
 */

export const ActionExecutor = /** @type {Context.Tag<ActionExecutorShape, ActionExecutorShape>} */ (
  Context.GenericTag("@solos/shared/ActionExecutor")
);
