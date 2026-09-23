// @ts-check
import { Clock, Effect } from "effect";
import { assertSwapWireBeforeContact, buildSignedSwap } from "./swap-sol.js";
import { submitSimulatedSwap } from "./swap-submit.js";

/** @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape; kit: import("../signer/kit-signer.js").KitSignerShape; build: import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape }} deps @param {import("@solos/actions").SwapAction} action @param {boolean} skipSimulation */
export const executeSwap = (deps, action, skipSimulation) =>
  Effect.gen(function* () {
    const swap = yield* buildSignedSwap(deps, action);
    yield* assertSwapWireBeforeContact(swap.signed);
    const signature = yield* submitSimulatedSwap(
      { ctx: deps.ctx, signed: swap.signed },
      skipSimulation,
    );
    return {
      action,
      status: /** @type {const} */ ("confirmed"),
      signature,
      executedAt: yield* Clock.currentTimeMillis,
      simulated: !skipSimulation,
      error: null,
    };
  });
