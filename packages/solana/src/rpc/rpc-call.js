// @ts-check
import { RpcError } from "@solos/core";
import { Effect } from "effect";
import { rpcOrigin } from "./rpc-origin.js";

export const RPC_REQUEST_FAILED = "the configured RPC endpoint failed the request";

/** @param {unknown} error */
export const describeError = (error) => {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
};

/**
 * Run one RPC call, translating any thrown error (Kit `SolanaError`, network) into the
 * shared `RpcError` so nothing library-specific escapes the adapter. The call receives an
 * AbortSignal that fires when the Effect is interrupted, so a deadline cancels the request.
 * @template A
 * @param {string} method
 * @param {string} url
 * @param {(abortSignal: AbortSignal) => Promise<A>} call
 * @returns {Effect.Effect<A, RpcError>}
 */
export const rpcCall = (method, url, call) =>
  Effect.tryPromise({
    try: call,
    catch: () => new RpcError({ method, url: rpcOrigin(url), reason: RPC_REQUEST_FAILED }),
  }).pipe(Effect.withSpan(`rpc.${method}`));
