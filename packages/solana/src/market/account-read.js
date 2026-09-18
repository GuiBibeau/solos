// @ts-check
import { address } from "@solana/kit";
import { RpcError } from "@solos/core";
import { Effect } from "effect";

/** Deadline for one account read, covering headers and body; injectable so tests never wait. */
export const TOKEN_RPC_TIMEOUT_MS = 30_000;

/**
 * One registry instance's endpoint-bound read configuration. The origin is computed once:
 * errors carry it, never the configured URL, because provider credentials can sit in the
 * path or query of an authenticated endpoint.
 * @typedef {{
 *   readonly rpc: import("../rpc/solana-rpc.js").SolanaRpcShape["rpc"];
 *   readonly origin: string;
 *   readonly timeoutMs: number
 * }} AccountRead
 */

/** True only for deadline aborts (`AbortSignal.timeout`), never for caller cancellation. @param {unknown} error */
const isDeadlineAbort = (error) => {
  const name = /** @type {{ name?: unknown }} */ (error)?.name;
  return name === "TimeoutError" || name === "AbortError";
};

/**
 * One bounded account read: the aborting deadline covers the time to the response headers and
 * the full body consumption (Kit passes the signal to its transport). At most two of these
 * happen per token read (mint, then metadata PDA); no subscriptions, no retries, no off-chain
 * fetches. Errors are rebuilt from fixed text over the endpoint origin — a provider's failure
 * message can echo the authenticated URL or key, so it never becomes a reason.
 * @param {AccountRead} read
 * @param {string} account
 * @returns {Effect.Effect<{ readonly owner: string; readonly data: readonly [string, string] } | null, RpcError>}
 */
export const fetchAccount = (read, account) =>
  Effect.tryPromise({
    try: () =>
      read.rpc
        .getAccountInfo(address(account), { encoding: "base64" })
        .send({ abortSignal: AbortSignal.timeout(read.timeoutMs) }),
    catch: (/** @type {unknown} */ error) =>
      new RpcError({
        method: "getAccountInfo",
        url: read.origin,
        reason: isDeadlineAbort(error)
          ? `no response within the ${read.timeoutMs}ms request deadline`
          : "the configured RPC endpoint failed the request",
      }),
  }).pipe(
    Effect.map((result) => result.value),
    Effect.withSpan("rpc.getAccountInfo"),
  );
