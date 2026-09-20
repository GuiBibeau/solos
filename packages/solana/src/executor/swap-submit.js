// @ts-check
import { SimulationFailed } from "@solos/core";
import { Effect } from "effect";
import { gateSwapLifetime } from "./swap-sol.js";
import { sendSigned, simulateSigned } from "./transfer-sol.js";

/**
 * Simulation and submission for the swap branch. Unless simulation is explicitly skipped, the
 * exact signed swap is simulated once; a failed simulation fails here with zero sends. A
 * successful simulation is followed by a second lifetime recheck — the build could expire while
 * it ran — and only then is that identical transaction sent exactly once. With simulation
 * skipped, the pre-submit gate has already run once immediately before this send.
 * @param {{
 *   ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   signed: import("./swap-sol.js").SignedSwap["signed"];
 *   envelope: import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope;
 * }} deps
 * @param {boolean} skipSimulation
 */
export const submitSimulatedSwap = ({ ctx, signed, envelope }, skipSimulation) =>
  Effect.gen(function* () {
    if (!skipSimulation) {
      const raw = yield* simulateSigned(ctx, signed);
      if (raw.err !== null) {
        return yield* new SimulationFailed({ reason: JSON.stringify(raw.err), logs: raw.logs });
      }
      yield* gateSwapLifetime(ctx, envelope);
    }
    return yield* sendSigned(ctx, signed);
  });
