// @ts-check
import { RpcError } from "@solos/core";
import { Effect } from "effect";

/** @param {unknown} error */
export const describeError = (error) => {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
};

/**
 * Run one RPC call, translating any thrown error (Kit `SolanaError`, network) into the
 * shared `RpcError` so nothing library-specific escapes the adapter.
 * @template A
 * @param {string} method
 * @param {string} url
 * @param {() => Promise<A>} call
 * @returns {Effect.Effect<A, RpcError>}
 */
export const rpcCall = (method, url, call) =>
  Effect.tryPromise({
    try: call,
    catch: (error) => new RpcError({ method, url, reason: describeError(error) }),
  }).pipe(Effect.withSpan(`rpc.${method}`));
