// @ts-check
import { getBase64EncodedWireTransaction, signTransactionMessageWithSigners } from "@solana/kit";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { buildRejection } from "../swap/jupiter-swap-build-accounts.js";
import {
  assembleSwapMessage,
  assertSwapMessageBounds,
} from "../swap/jupiter-swap-build-assemble.js";
import { assertV1WireForSubmission } from "./transaction-v1.js";

/** Same executor identity as direct-signer-executor.js, inlined to keep this module acyclic. */
const EXECUTOR = "direct-signer";

/**
 * Execution amounts are bounded to u64: the swap payload's embedded input amount is a u64 arg,
 * so a larger Action amount could never be bound to the transaction and is refused before any
 * build request. Quote-only reads keep unbounded decimal strings; only this branch bounds.
 */
export const SWAP_AMOUNT_U64_MAX = 18_446_744_073_709_551_615n;
const AMOUNT_BOUND_REASON = "swap amount exceeded the u64 bound the executor can assemble";
const VALIDATION_GUARD_REASON =
  "build validation could not be completed; nothing was signed or sent";
const ASSEMBLY_GUARD_REASON = "build could not be assembled; nothing was signed or sent";

/** @param {import("@solos/actions").SwapAction} action */
const amountBoundRejection = (action) => {
  if (!/^\d+$/.test(action.amount) || BigInt(action.amount) > SWAP_AMOUNT_U64_MAX) {
    return AMOUNT_BOUND_REASON;
  }
  return undefined;
};

/**
 * The executor's swap branch: one fresh Jupiter build for the configured signer's taker
 * address, validated against the exact Action, assembled into one message, signed once. The
 * identical signed transaction is what gets simulated and what gets sent. Nothing here touches
 * the chain — the caller owns simulation, the lifetime gate, and submission.
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").SwapAction} SwapAction
 * @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} JupiterBuildEnvelope
 * @typedef {Awaited<ReturnType<typeof signTransactionMessageWithSigners>>} Signed
 */

/**
 * @typedef {{
 *   readonly signed: Signed;
 *   readonly envelope: JupiterBuildEnvelope;
 * }} SignedSwap
 */

/**
 * Fetch, validate, assemble, and sign one swap. A pump venue is refused before any build
 * request until that venue is supported (#25); an omitted or explicit `jupiter` venue takes the
 * Jupiter path.
 * @param {{ kit: Kit; build: Build }} deps
 * @param {SwapAction} action
 * @returns {import("effect").Effect.Effect<
 *   SignedSwap,
 *   BuildRejected | import("@solos/core").BuildUnavailable | UnsupportedAction
 * >}
 */
export const buildSignedSwap = ({ kit, build }, action) =>
  Effect.gen(function* () {
    if (action.venue === "pump") {
      return yield* new UnsupportedAction({ actionType: "swap:pump", executor: EXECUTOR });
    }
    const overBound = amountBoundRejection(action);
    if (overBound) return yield* new BuildRejected({ reason: overBound });
    const taker = kit.signer.address;
    const envelope = yield* build.build({
      inputMint: action.inputMint,
      outputMint: action.outputMint,
      amount: action.amount,
      slippageBps: action.maxSlippageBps,
      taker,
    });
    // Semantic validation runs as its own guarded step: even a validator crash on a malformed
    // artifact is a fixed-reason rejection, never an Effect defect or raw library text.
    const rejection = yield* Effect.tryPromise({
      try: () => buildRejection(envelope, action, taker),
      catch: () => new BuildRejected({ reason: VALIDATION_GUARD_REASON }),
    });
    if (rejection) return yield* new BuildRejected({ reason: rejection });
    const message = yield* Effect.try({
      try: () => assembleSwapMessage(envelope, kit.signer),
      catch: () => new BuildRejected({ reason: ASSEMBLY_GUARD_REASON }),
    });
    // Pre-sign boundary: the message must be v1 and inside the fixed size bounds. A refusal
    // here happens before any signer is involved — no signature, no chain contact.
    yield* Effect.try({
      try: () => assertSwapMessageBounds(message),
      catch: (error) => /** @type {BuildRejected} */ (error),
    });
    const signed = yield* Effect.tryPromise({
      // Compression rewrites account metas into lookup-table indexes; the signer registrations
      // on the taker's static accounts survive, but their refined type does not.
      try: () =>
        signTransactionMessageWithSigners(
          /** @type {Parameters<typeof signTransactionMessageWithSigners>[0]} */ (
            /** @type {unknown} */ (message)
          ),
        ),
      catch: () => new BuildRejected({ reason: "swap transaction could not be signed" }),
    });
    return { signed, envelope };
  });

/**
 * Pre-submit boundary: the exact wire bytes about to touch the RPC must decode to a v1
 * message. A refusal here is a fixed-reason `BuildRejected` before simulation or send — no
 * network contact with those bytes in any form.
 * @param {Signed} signed
 * @returns {import("effect").Effect.Effect<unknown, BuildRejected>}
 */
export const assertSwapWireBeforeContact = (signed) =>
  Effect.try({
    try: () => assertV1WireForSubmission(getBase64EncodedWireTransaction(signed)),
    catch: (error) => /** @type {BuildRejected} */ (error),
  });

/**
 * Reject an expired build before anything is simulated or sent: the confirmed block height must
 * still be inside the provider's stated lifetime, otherwise the exact transaction built above
 * can never land and nothing leaves solOS.
 * @param {Rpc} ctx
 * @param {JupiterBuildEnvelope} envelope
 * @returns {import("effect").Effect.Effect<void, BuildRejected | import("@solos/core").RpcError>}
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
