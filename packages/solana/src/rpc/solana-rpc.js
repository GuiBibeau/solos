// @ts-check
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { Context, Layer } from "effect";

/**
 * Adapter-internal: the Kit RPC pair. Core never sees this tag.
 * @typedef {{
 *   readonly url: string;
 *   readonly rpc: import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>;
 *   readonly rpcSubscriptions: import("@solana/kit").RpcSubscriptions<import("@solana/kit").SolanaRpcSubscriptionsApi>;
 * }} SolanaRpcShape
 */

export const SolanaRpc = /** @type {Context.Tag<SolanaRpcShape, SolanaRpcShape>} */ (
  Context.GenericTag("@solos/solana/SolanaRpc")
);

/**
 * @param {string} rpcUrl
 * @param {string} wsUrl
 */
export const SolanaRpcLive = (rpcUrl, wsUrl) =>
  Layer.succeed(SolanaRpc, {
    url: rpcUrl,
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
  });
