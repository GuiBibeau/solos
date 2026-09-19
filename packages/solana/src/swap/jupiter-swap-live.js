// @ts-check
import { QuoteConfigMissing, SwapProvider } from "@solos/core";
import { Effect, Layer } from "effect";
import { fetchQuote } from "./jupiter-swap-response.js";

/**
 * Live Jupiter Swap API V2 adapter (quote-only). The key is optional at wiring time and
 * required only when a quote is actually read; missing config fails pre-HTTP, so tool discovery
 * never breaks. Execution is not part of this port: execute-tier swap use cases go through the
 * shared ActionExecutor, whose swap branch fetches a fresh build per call (ADR-0013).
 * @param {{ baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: import("./jupiter-swap-api.js").Fetch }} config
 */
export const JupiterSwapLive = (config) =>
  Layer.effect(
    SwapProvider,
    Effect.succeed({
      name: "jupiter",
      quote: (request) => {
        if (!config.apiKey?.trim()) {
          return Effect.fail(
            new QuoteConfigMissing({
              reason: "JUPITER_API_KEY is not set; export it to use Jupiter swap quotes",
            }),
          );
        }
        return fetchQuote(request, {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          timeoutMs: config.timeoutMs,
          fetchImpl: config.fetchImpl,
        });
      },
    }),
  );
