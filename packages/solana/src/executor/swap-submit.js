// @ts-check
import { SimulationFailed } from "@solos/core";
import { Effect } from "effect";
import { recheckSignedSwapLifetime } from "./swap-preflight.js";
import { sendSigned, simulateSigned } from "./transfer-sol.js";

/**
 * Simulation and submission for the swap branch. Unless simulation is explicitly skipped, the
 * exact signed swap is simulated once; a failed simulation fails here with zero sends. A
 * signed lifetime is checked before simulation, and a successful simulation is followed by a
 * second check because it could expire while simulation ran. Only then is that identical
 * transaction sent exactly once. An explicit skip still checks immediately before submission.
 * @param {{
 *   ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   signed: import("./swap-sol.js").SignedSwap["signed"];
 * }} deps
 * @param {boolean} skipSimulation
 */
export const submitSimulatedSwap = ({ ctx, signed }, skipSimulation) =>
  Effect.gen(function* () {
    yield* recheckSignedSwapLifetime(ctx, signed);
    if (!skipSimulation) {
      const raw = yield* simulateSigned(ctx, signed);
      if (raw.err !== null) {
        return yield* new SimulationFailed({ reason: JSON.stringify(raw.err), logs: raw.logs });
      }
      yield* recheckSignedSwapLifetime(ctx, signed);
    }
    return yield* sendSigned(ctx, signed);
  });
