// @ts-check
/**
 * Where Submission delivers sealed bytes (ADR-0031). A Submitter sends and reports status; it
 * never signs, never re-signs, and never decides when to stop waiting — the confirmation loop
 * does, so every Submitter gets the same guarantees. The RPC node is the default adapter; a
 * landing service, a bundle engine or a colocated sender is another one at this seam.
 */
import { RpcError } from "@solos/core";
import { Context, Effect, Layer } from "effect";
import { RPC_REQUEST_FAILED, rpcCall } from "../rpc/rpc-call.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";

/**
 * `status` returns the raw signature status row (or null when the node has none); the
 * confirmation loop reads it against the mode's commitment.
 * @typedef {{
 *   readonly name: string;
 *   readonly send: (sealed: import("./sealed.js").Sealed) =>
 *     Effect.Effect<void, import("@solos/core").RpcError | import("@solos/core").TransactionFailed>;
 *   readonly status: (signature: import("@solana/kit").Signature) =>
 *     Effect.Effect<unknown, import("@solos/core").RpcError>;
 * }} SubmitterShape
 */

export const Submitter = /** @type {Context.Tag<SubmitterShape, SubmitterShape>} */ (
  Context.GenericTag("@solos/solana/Submitter")
);

/**
 * Status through the node's own history, so a signature that landed while the transport broke
 * is still found. Shared by every Submitter that confirms through RPC. A response without a
 * status list is the node failing the request, not a pending signature.
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {import("@solana/kit").Signature} signature
 * @returns {Effect.Effect<unknown, RpcError>}
 */
export const rpcStatus = (ctx, signature) =>
  Effect.flatMap(
    rpcCall("getSignatureStatuses", ctx.url, (abortSignal) =>
      ctx.rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: true })
        .send({ abortSignal }),
    ),
    (response) => {
      const rows = /** @type {{ value?: unknown } | null | undefined} */ (response)?.value;
      if (Array.isArray(rows)) return Effect.succeed(rows[0] ?? null);
      return Effect.fail(
        new RpcError({
          method: "getSignatureStatuses",
          url: rpcOrigin(ctx.url),
          reason: RPC_REQUEST_FAILED,
        }),
      );
    },
  );

/**
 * One `sendTransaction` per delivery; the node runs its own preflight at `confirmed`.
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @returns {SubmitterShape}
 */
export const rpcSubmitter = (ctx) => ({
  name: "rpc",
  send: (sealed) =>
    Effect.asVoid(
      rpcCall("sendTransaction", ctx.url, (abortSignal) =>
        ctx.rpc
          .sendTransaction(sealed.wire, { encoding: "base64", preflightCommitment: "confirmed" })
          .send({ abortSignal }),
      ),
    ),
  status: (signature) => rpcStatus(ctx, signature),
});

/** The default Submitter: the configured RPC node. */
export const RpcSubmitterLive = Layer.effect(Submitter, Effect.map(SolanaRpc, rpcSubmitter));
