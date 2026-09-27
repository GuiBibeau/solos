// @ts-check
import {
  BuildUnavailable,
  QuoteAuthFailed,
  QuoteHttpError,
  QuoteRateLimited,
  QuoteResponseInvalid,
  QuoteTimeout,
} from "@solos/core";
import { Context, Effect, Layer } from "effect";
import { fetchBuild } from "./jupiter-swap-build-response.js";

/**
 * Adapter-internal handle to the Jupiter V2 build client. Core never sees this tag: execute-tier
 * use cases go through ActionExecutor, and this feeds that executor's swap branch (ADR-0013).
 * Its error channel is the executor's own: a build that cannot be obtained is `BuildUnavailable`
 * — the provider-side quote vocabulary never crosses into the executor port.
 * @typedef {{
 *   readonly build: (params: import("./jupiter-swap-build-api.js").SwapBuildParams) =>
 *     import("effect").Effect.Effect<
 *       import("./jupiter-swap-build-response.js").JupiterBuildEnvelope,
 *       import("@solos/core").BuildUnavailable
 *     >;
 * }} JupiterSwapBuildShape
 */

export const JupiterSwapBuild =
  /** @type {Context.Tag<JupiterSwapBuildShape, JupiterSwapBuildShape>} */ (
    Context.GenericTag("@solos/solana/JupiterSwapBuild")
  );

/**
 * Fixed executor-channel reasons for the documented provider failure modes. Bodies, keys, and
 * endpoints never travel with them.
 * @param {unknown} error
 * @returns {BuildUnavailable}
 */
const toBuildUnavailable = (error) => {
  if (error instanceof QuoteAuthFailed) {
    return new BuildUnavailable({
      reason: `Jupiter rejected the build credential with HTTP ${error.status}`,
      ...(error.remedy && { remedy: error.remedy }),
    });
  }
  if (error instanceof QuoteRateLimited) {
    return new BuildUnavailable({ reason: "Jupiter rate limited the build request" });
  }
  if (error instanceof QuoteTimeout) {
    return new BuildUnavailable({ reason: "Jupiter build request timed out before a response" });
  }
  if (error instanceof QuoteResponseInvalid) {
    return new BuildUnavailable({ reason: "Jupiter build response did not match the contract" });
  }
  if (error instanceof QuoteHttpError) {
    return new BuildUnavailable({ reason: error.reason });
  }
  return new BuildUnavailable({ reason: "Jupiter build request failed without a response" });
};

/**
 * Live build client for `GET /swap/v2/build`. The key is optional at wiring time and required
 * only when a build is actually fetched; missing config fails pre-HTTP, so unrelated tool
 * discovery never breaks. Single attempt, one deadline, redacted failures, no retry.
 * @param {{ baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: import("./jupiter-swap-api.js").Fetch }} config
 */
export const JupiterSwapBuildLive = (config) =>
  Layer.effect(
    JupiterSwapBuild,
    Effect.succeed({
      build: (params) => {
        if (!config.apiKey?.trim()) {
          return Effect.fail(
            new BuildUnavailable({
              reason: "JUPITER_API_KEY is not set; export it to execute Jupiter swaps",
              remedy:
                "create a key with Swap access at https://portal.jup.ag and export " +
                "JUPITER_API_KEY",
            }),
          );
        }
        return fetchBuild(params, {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          timeoutMs: config.timeoutMs,
          fetchImpl: config.fetchImpl,
        }).pipe(Effect.catchAll((error) => Effect.fail(toBuildUnavailable(error))));
      },
    }),
  );
