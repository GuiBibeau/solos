// @ts-check
import { SimulationFailed } from "@solos/core";
import { Effect } from "effect";
import { simulationErrorText } from "./simulation-error-text.js";
import { recheckSignedSwapLifetime } from "./swap-preflight.js";
import { sendSigned, simulateSigned } from "./transfer-sol.js";

/**
 * Simulate signed bytes unless explicitly skipped. Withdrawal also rechecks blockhash
 * lifetime before and after simulation so expired bytes can never be submitted.
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape; signed: import("./swap-sol.js").SignedSwap["signed"]; checkLifetime: boolean }} deps
 * @param {boolean} skipSimulation
 */
export const submitSimulated = ({ ctx, signed, checkLifetime }, skipSimulation) =>
  Effect.gen(function* () {
    if (checkLifetime) yield* recheckSignedSwapLifetime(ctx, signed);
    if (!skipSimulation) {
      const raw = yield* simulateSigned(ctx, signed);
      if (raw.err !== null) {
        return yield* new SimulationFailed({
          reason: simulationErrorText(raw.err),
          logs: raw.logs,
        });
      }
    }
    if (checkLifetime) yield* recheckSignedSwapLifetime(ctx, signed);
    return yield* sendSigned(ctx, signed);
  });
