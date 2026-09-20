// @ts-check
import { signTransactionMessageWithSigners } from "@solana/kit";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { buildRejection } from "../swap/jupiter-swap-build-accounts.js";
import { assembleSwapMessage } from "../swap/jupiter-swap-build-assemble.js";

/** Same executor identity as direct-signer-executor.js, inlined to keep this module acyclic. */
const EXECUTOR = "direct-signer";

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
    const taker = kit.signer.address;
    const envelope = yield* build.build({
      inputMint: action.inputMint,
      outputMint: action.outputMint,
      amount: action.amount,
      slippageBps: action.maxSlippageBps,
      taker,
    });
    const rejection = yield* Effect.promise(() => buildRejection(envelope, action, taker));
    if (rejection) return yield* new BuildRejected({ reason: rejection });
    const compressed = assembleSwapMessage(envelope, kit.signer);
    const signed = yield* Effect.tryPromise({
      // Compression rewrites account metas into lookup-table indexes; the signer registrations
      // on the taker's static accounts survive, but their refined type does not.
      try: () =>
        signTransactionMessageWithSigners(
          /** @type {Parameters<typeof signTransactionMessageWithSigners>[0]} */ (
            /** @type {unknown} */ (compressed)
          ),
        ),
      catch: () => new BuildRejected({ reason: "swap transaction could not be signed" }),
    });
    return { signed, envelope };
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
