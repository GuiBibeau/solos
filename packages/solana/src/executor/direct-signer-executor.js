// @ts-check
import { ActionExecutor, SimulationFailed, UnsupportedAction } from "@solos/core";
import { Clock, Effect, Layer } from "effect";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSigner } from "../signer/kit-signer.js";
import { JupiterSwapBuild } from "../swap/jupiter-swap-build-live.js";
import { assertSwapWireBeforeContact, buildSignedSwap, gateSwapLifetime } from "./swap-sol.js";
import { submitSimulatedSwap } from "./swap-submit.js";
import { buildSignedTransfer, sendSigned, simulateSigned } from "./transfer-sol.js";

export const EXECUTOR_NAME = "direct-signer";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").Action} Action
 */

/** @typedef {{ ctx: Rpc; kit: Kit; build: Build }} Deps */

/**
 * Build and sign whatever the action asks for. One branch per supported action type; anything
 * else is `UnsupportedAction` so callers learn the gap instead of guessing.
 * @param {Deps} deps
 * @param {Action} action
 */
const build = ({ ctx, kit, build: buildSwap }, action) => {
  if (action.type === "transfer_sol") return buildSignedTransfer(ctx, kit, action);
  if (action.type === "swap") {
    return Effect.map(buildSignedSwap({ kit, build: buildSwap }, action), ({ signed }) => signed);
  }
  return Effect.fail(new UnsupportedAction({ actionType: action.type, executor: EXECUTOR_NAME }));
};

/**
 * @param {Deps} deps
 * @param {Action} action
 * @returns {import("effect").Effect.Effect<import("@solos/actions").SimulationResult, import("@solos/core").ExecutorError>}
 */
const simulate = ({ ctx, kit, build: buildSwap }, action) =>
  Effect.gen(function* () {
    const signed = yield* build({ ctx, kit, build: buildSwap }, action);
    if (action.type === "swap") yield* assertSwapWireBeforeContact(signed);
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
 * @param {Deps} deps
 * @param {Action} action
 * @param {{ readonly skipSimulation: boolean }} options
 * @returns {import("effect").Effect.Effect<import("@solos/actions").ExecutionResult, import("@solos/core").ExecutorError>}
 */
const execute = ({ ctx, kit, build: buildSwap }, action, options) =>
  Effect.gen(function* () {
    if (action.type === "swap") {
      const swap = yield* buildSignedSwap({ kit, build: buildSwap }, action);
      // Pre-submit boundary: the exact bytes are proven v1 before the first RPC contact.
      yield* assertSwapWireBeforeContact(swap.signed);
      // Only then is the build's own lifetime gated before simulation or send.
      yield* gateSwapLifetime(ctx, swap.envelope);
      const signature = yield* submitSimulatedSwap(
        { ctx, signed: swap.signed, envelope: swap.envelope },
        options.skipSimulation,
      );
      return {
        action,
        status: "confirmed",
        signature,
        executedAt: yield* Clock.currentTimeMillis,
        simulated: !options.skipSimulation,
        error: null,
      };
    }
    const signed = yield* build({ ctx, kit, build: buildSwap }, action);
    const signature = yield* submitSimulated({ ctx, signed }, options.skipSimulation);
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
 * Simulate the exact signed transaction (unless explicitly skipped) and send that identical
 * transaction once. A failed simulation fails here — nothing was ever sent.
 * @param {{ ctx: Rpc; signed: import("./swap-sol.js").SignedSwap["signed"] }} deps
 * @param {boolean} skipSimulation
 */
const submitSimulated = ({ ctx, signed }, skipSimulation) =>
  Effect.gen(function* () {
    if (!skipSimulation) {
      const raw = yield* simulateSigned(ctx, signed);
      if (raw.err !== null) {
        return yield* new SimulationFailed({ reason: JSON.stringify(raw.err), logs: raw.logs });
      }
    }
    return yield* sendSigned(ctx, signed);
  });

/**
 * The default executor: the configured keypair signs and sends directly (ADR-0013).
 * Right for wallet mode, paper mode on Surfpool, and dev. A vault engine is a different Layer.
 */
export const DirectSignerExecutor = Layer.effect(
  ActionExecutor,
  Effect.all([SolanaRpc, KitSigner, JupiterSwapBuild]).pipe(
    Effect.map(([ctx, kit, build]) => ({
      name: EXECUTOR_NAME,
      simulate: (action) => simulate({ ctx, kit, build }, action),
      execute: (action, options) => execute({ ctx, kit, build }, action, options),
    })),
  ),
);
