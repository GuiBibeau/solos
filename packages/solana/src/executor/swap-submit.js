// @ts-check
import { SimulationFailed } from "@solos/core";
import { Effect } from "effect";
import { simulationErrorText } from "./simulation-error-text.js";
import { recheckSignedSwapLifetime } from "./swap-preflight.js";
import { simulateSwapBounded } from "./swap-spend-bound.js";
import { sendSigned } from "./transfer-sol.js";

/**
 * Simulation and submission for the swap branch. Unless simulation is explicitly skipped, the
 * exact signed swap is simulated once; a failed simulation fails here with zero sends. A
 * signed lifetime is checked before simulation, and a successful simulation is followed by a
 * second check because it could expire while simulation ran. Only then is that identical
 * transaction sent exactly once. An explicit skip still checks immediately before submission.
 * @param {{
 *   ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   signed: import("./swap-sol.js").SignedSwap["signed"];
 *   taker: string;
 *   action: import("@solos/actions").SwapAction;
 *   credit: bigint;
 * }} deps
 * @param {boolean} skipSimulation
 */
export const submitSimulatedSwap = ({ ctx, signed, taker, action, credit }, skipSimulation) =>
  Effect.gen(function* () {
    yield* recheckSignedSwapLifetime(ctx, signed);
    if (!skipSimulation) {
      const raw = yield* simulateSwapBounded(ctx, { signed, taker, action, credit });
      if (raw.err !== null) {
        // BigInt-safe, like every other submit path: a simulation error carrying a u64 field
        // would otherwise throw inside the failure constructor and replace the typed
        // SimulationFailed — the one thing that says *why* nothing was sent — with an untyped
        // InternalError.
        return yield* new SimulationFailed({
          reason: simulationErrorText(raw.err),
          logs: raw.logs,
        });
      }
      yield* recheckSignedSwapLifetime(ctx, signed);
    }
    return yield* sendSigned(ctx, signed);
  });
