// @ts-check
import { signTransactionMessageWithSigners } from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { buildRejection } from "../swap/jupiter-swap-build-accounts.js";
import {
  assembleSwapMessage,
  assertSwapMessageBounds,
} from "../swap/jupiter-swap-build-assemble.js";

export const SWAP_AMOUNT_U64_MAX = 18_446_744_073_709_551_615n;
const AMOUNT_BOUND_REASON = "swap amount exceeded the u64 bound the executor can assemble";
const VALIDATION_GUARD_REASON =
  "build validation could not be completed; nothing was signed or sent";
const ASSEMBLY_GUARD_REASON = "build could not be assembled; nothing was signed or sent";

/**
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").SwapAction} SwapAction
 * @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} JupiterBuildEnvelope
 * @typedef {Awaited<ReturnType<typeof signTransactionMessageWithSigners>>} Signed
 */

/** @param {SwapAction} action */
const amountBoundRejection = (action) => {
  if (!/^\d+$/.test(action.amount) || BigInt(action.amount) > SWAP_AMOUNT_U64_MAX) {
    return AMOUNT_BOUND_REASON;
  }
  return undefined;
};

/**
 * Fetch the provider build and hold it to the semantic rejection chain. Validator crashes on
 * malformed artifacts become fixed-reason rejections, never Effect defects or provider text.
 * @param {{ kit: Kit; build: Build }} deps @param {SwapAction} action
 */
export const fetchValidatedBuild = ({ kit, build }, action) =>
  Effect.gen(function* () {
    const overBound = amountBoundRejection(action);
    if (overBound) return yield* new BuildRejected({ reason: overBound });
    const envelope = yield* build.build({
      inputMint: action.inputMint,
      outputMint: action.outputMint,
      amount: action.amount,
      slippageBps: action.maxSlippageBps,
      taker: kit.signer.address,
    });
    const rejection = yield* Effect.tryPromise({
      try: () => buildRejection(envelope, action, kit.signer.address),
      catch: () => new BuildRejected({ reason: VALIDATION_GUARD_REASON }),
    });
    if (rejection) return yield* new BuildRejected({ reason: rejection });
    return envelope;
  });

/**
 * Assemble the validated envelope and sign it once. The pre-sign boundary proves v1 and the
 * fixed size bounds before involving a signer.
 * @param {{ kit: Kit }} deps @param {JupiterBuildEnvelope} envelope
 * @returns {import("effect").Effect.Effect<Signed, BuildRejected>}
 */
export const assembleAndSign = ({ kit }, envelope) =>
  Effect.gen(function* () {
    const message = yield* Effect.try({
      try: () => assembleSwapMessage(envelope, kit.signer),
      catch: () => new BuildRejected({ reason: ASSEMBLY_GUARD_REASON }),
    });
    yield* Effect.try({
      try: () => assertSwapMessageBounds(message),
      catch: (error) => /** @type {BuildRejected} */ (error),
    });
    return yield* Effect.tryPromise({
      try: () =>
        signTransactionMessageWithSigners(
          /** @type {Parameters<typeof signTransactionMessageWithSigners>[0]} */
          (/** @type {unknown} */ (message)),
        ),
      catch: () => new BuildRejected({ reason: "swap transaction could not be signed" }),
    });
  });
