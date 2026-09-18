// @ts-check
import { QuoteConfigMissing, SwapFailed, SwapProvider } from "@solos/core";
import { Effect, Layer } from "effect";
import { fetchQuote } from "./jupiter-swap-response.js";

/** Fixed reason for the port-required execute method, unsupported until build execution (#18). */
const EXECUTE_UNSUPPORTED =
  "Jupiter swap execution is not implemented; quote-only until Action-based build execution lands (#18)";

/**
 * Live Jupiter Swap API V2 adapter (quote-only). The key is optional at wiring time and
 * required only when a quote is actually read; missing config fails pre-HTTP, so tool discovery
 * never breaks. `execute` is part of the port but deliberately unsupported in this slice: it
 * fails fast with a tagged domain error and performs no I/O — there is no send, signing, or
 * /execute path. A later execution obtains a fresh build rather than promising this quote.
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
      execute: () => Effect.fail(new SwapFailed({ signature: null, reason: EXECUTE_UNSUPPORTED })),
    }),
  );
