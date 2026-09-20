// @ts-check
import { getBase64EncodedWireTransaction } from "@solana/kit";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { assembleAndSign, fetchValidatedBuild } from "./swap-sol-build.js";
import { assertV1WireForSubmission } from "./transaction-v1.js";

const EXECUTOR = "direct-signer";
export { SWAP_AMOUNT_U64_MAX } from "./swap-sol-build.js";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").SwapAction} SwapAction
 * @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} JupiterBuildEnvelope
 * @typedef {import("./swap-sol-build.js").Signed} Signed
 */

/** @typedef {{ readonly signed: Signed; readonly envelope: JupiterBuildEnvelope }} SignedSwap */

/**
 * Fetch, validate, assemble, and sign one swap. Only Jupiter is supported; unsupported venues
 * are refused before any build request.
 * @param {{ kit: Kit; build: Build }} deps @param {SwapAction} action
 */
export const buildSignedSwap = ({ kit, build }, action) =>
  Effect.gen(function* () {
    if (action.venue === "pump") {
      return yield* new UnsupportedAction({ actionType: "swap:pump", executor: EXECUTOR });
    }
    if (action.venue !== undefined && action.venue !== "jupiter") {
      return yield* new UnsupportedAction({
        actionType: `swap:${action.venue}`,
        executor: EXECUTOR,
      });
    }
    const envelope = yield* fetchValidatedBuild({ kit, build }, action);
    const signed = yield* assembleAndSign({ kit }, envelope);
    return { signed, envelope };
  });

/**
 * Prove the exact wire bytes about to touch RPC decode to a v1 message.
 * @param {Signed} signed
 * @returns {import("effect").Effect.Effect<unknown, BuildRejected>}
 */
export const assertSwapWireBeforeContact = (signed) =>
  Effect.try({
    try: () => assertV1WireForSubmission(getBase64EncodedWireTransaction(signed)),
    catch: (error) => /** @type {BuildRejected} */ (error),
  });

/**
 * Reject an expired build before anything is simulated or sent.
 * @param {Rpc} ctx @param {JupiterBuildEnvelope} envelope
 */
export const gateSwapLifetime = (ctx, envelope) =>
  Effect.gen(function* () {
    const height = yield* rpcCall("getBlockHeight", ctx.url, () =>
      ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    if (height >= BigInt(envelope.blockhashWithMetadata.lastValidBlockHeight)) {
      return yield* new BuildRejected({
        reason: "blockhash lifetime had already expired before submit; nothing was sent",
      });
    }
  });
