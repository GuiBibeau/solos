// @ts-check
import { ActionExecutor, SimulationFailed, UnsupportedAction } from "@solos/core";
import { Clock, Effect, Layer } from "effect";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSigner } from "../signer/kit-signer.js";
import { buildSignedTransfer, sendSigned, simulateSigned } from "./transfer-sol.js";

export const EXECUTOR_NAME = "direct-signer";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("@solos/actions").Action} Action
 */

/**
 * Build and sign whatever the action asks for. One branch per supported action type; anything
 * else is `UnsupportedAction` so callers learn the gap instead of guessing.
 * @param {Rpc} ctx
 * @param {Kit} kit
 * @param {Action} action
 */
const build = (ctx, kit, action) => {
  if (action.type === "transfer_sol") return buildSignedTransfer(ctx, kit, action);
  return Effect.fail(new UnsupportedAction({ actionType: action.type, executor: EXECUTOR_NAME }));
};

/**
 * @param {Rpc} ctx
 * @param {Kit} kit
 * @param {Action} action
 * @returns {import("effect").Effect.Effect<import("@solos/actions").SimulationResult, import("@solos/core").ExecutorError>}
 */
const simulate = (ctx, kit, action) =>
  Effect.gen(function* () {
    const signed = yield* build(ctx, kit, action);
    const raw = yield* simulateSigned(ctx, signed);
    const isOk = raw.err === null;
    return {
      action,
      ok: isOk,
      unitsConsumed: raw.unitsConsumed,
      logs: raw.logs,
      projectedPortfolio: null,
      violations: isOk ? [] : [{ rule: "simulation", message: JSON.stringify(raw.err) }],
    };
  });

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {Action} action
 * @param {{ readonly skipSimulation: boolean }} options
 * @returns {import("effect").Effect.Effect<import("@solos/actions").ExecutionResult, import("@solos/core").ExecutorError>}
 */
const execute = ({ ctx, kit }, action, options) =>
  Effect.gen(function* () {
    const signed = yield* build(ctx, kit, action);
    if (!options.skipSimulation) {
      const raw = yield* simulateSigned(ctx, signed);
      if (raw.err !== null) {
        return yield* new SimulationFailed({ reason: JSON.stringify(raw.err), logs: raw.logs });
      }
    }
    const signature = yield* sendSigned(ctx, signed);
    return {
      action,
      status: "confirmed",
      signature,
      executedAt: yield* Clock.currentTimeMillis,
      simulated: !options.skipSimulation,
      error: null,
    };
  });

/**
 * The default executor: the configured keypair signs and sends directly (ADR-0013).
 * Right for wallet mode, paper mode on Surfpool, and dev. A vault engine is a different Layer.
 */
export const DirectSignerExecutor = Layer.effect(
  ActionExecutor,
  Effect.all([SolanaRpc, KitSigner]).pipe(
    Effect.map(([ctx, kit]) => ({
      name: EXECUTOR_NAME,
      simulate: (action) => simulate(ctx, kit, action),
      execute: (action, options) => execute({ ctx, kit }, action, options),
    })),
  ),
);
