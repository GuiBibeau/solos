// @ts-check
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { confirmationState } from "./confirm.js";
import { rpcStatus } from "./submitter.js";

/**
 * What recovery can know about a signature that may already have been broadcast.
 * `confirmation` is `pending` until it reaches `confirmed`. `height` is the confirmed block
 * height, so a blockhash is expired only when this is past the stored last valid height.
 * @param {string} signature
 * @returns {Effect.Effect<
 *   { readonly confirmation: "pending" | "success" | "failed"; readonly height: bigint },
 *   import("@solos/core").RpcError,
 *   import("../rpc/solana-rpc.js").SolanaRpcShape
 * >}
 */
export const signatureOutlook = (signature) =>
  Effect.gen(function* () {
    const ctx = yield* SolanaRpc;
    const status = yield* rpcStatus(ctx, asSignature(signature));
    const height = yield* blockHeight(ctx);
    return { confirmation: confirmationState(status), height: asBigint(height) };
  });

/** @param {string} signature */
const asSignature = (signature) => /** @type {import("@solana/kit").Signature} */ (signature);

/** @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx */
const blockHeight = (ctx) =>
  rpcCall("getBlockHeight", ctx.url, (abortSignal) =>
    ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal }),
  );

/** @param {unknown} height */
const asBigint = (height) => (typeof height === "bigint" ? height : BigInt(String(height)));
