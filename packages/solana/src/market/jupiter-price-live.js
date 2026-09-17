// @ts-check
import {
  PriceAuthFailed,
  PriceConfigMissing,
  PriceFeed,
  PriceHttpError,
  PriceNetworkError,
  PriceRateLimited,
  PriceResponseInvalid,
  PriceTimeout,
  PriceUnavailable,
} from "@solos/core";
import { Effect, Layer } from "effect";
import { z } from "zod";
import { DEFAULT_TIMEOUT_MS, isDeadlineAbort } from "./elfa-api.js";
import { jupiterPrice } from "./jupiter-api.js";

/**
 * Live USD prices over Jupiter's Price V3 HTTP API (`GET {base}/price/v3?ids=<mint>`).
 *
 * Exactness: the provider sends `usdPrice` as a JSON number, so JSON.parse has already fixed it
 * as an IEEE-754 double before this adapter sees it. Normalizing with String() keeps that value
 * verbatim (shortest round-trip decimal) and adds no further rounding. A USD price is a
 * valuation figure, never a base-unit amount, so exact decimal arithmetic is not available here.
 *
 * `blockId` in the response is a provider sequence number, not a millisecond timestamp, so the
 * returned `at` is the local receipt time and must never be presented as source freshness.
 */

/** Documented per-mint entry, parsed in strip mode so provider extensions never break us. */
const MintEntrySchema = z.object({
  usdPrice: z.number().finite().nonnegative(),
});

const SOURCE = /** @type {const} */ ("jupiter");

/**
 * Non-2xx status to the slice error, or undefined for 2xx.
 * @param {number} status
 * @returns {import("@solos/core").PriceFeedError | undefined}
 */
const statusError = (status) => {
  if (status === 401 || status === 403) return new PriceAuthFailed({ status });
  if (status === 429) return new PriceRateLimited({ status });
  if (status < 200 || status >= 300)
    return new PriceHttpError({ status, reason: `Jupiter answered with HTTP ${status}` });
  return undefined;
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isJsonObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** @param {string} body @returns {unknown} */
const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/**
 * Translate one outcome into the price or a slice-owned error. Raw bodies and the API key never
 * become error props; only the HTTP status and a short fixed reason travel. A mint omitted from
 * a 200 object is PriceUnavailable — falsy-zero handling is deliberate: `usdPrice: 0` is a
 * price, omission is not.
 * @param {import("./jupiter-api.js").JupiterPriceOutcome} outcome
 * @param {string} mint
 */
const fromOutcome = (outcome, mint) => {
  const failed = statusError(outcome.status);
  if (failed) return Effect.fail(failed);
  const parsed = parseJson(outcome.body);
  if (!isJsonObject(parsed)) {
    return Effect.fail(
      new PriceResponseInvalid({
        status: outcome.status,
        reason: "Jupiter price response was not a JSON object",
      }),
    );
  }
  if (!Object.hasOwn(parsed, mint)) {
    return Effect.fail(
      new PriceUnavailable({
        mint,
        source: SOURCE,
        reason: "omitted from the Jupiter price response",
      }),
    );
  }
  const entry = MintEntrySchema.safeParse(parsed[mint]);
  if (!entry.success) {
    return Effect.fail(
      new PriceResponseInvalid({
        status: outcome.status,
        reason: "Jupiter usdPrice was not a finite nonnegative number",
      }),
    );
  }
  return Effect.succeed({
    mint,
    priceUsd: String(entry.data.usdPrice),
    source: SOURCE,
    at: Date.now(),
  });
};

/**
 * Live Jupiter Price V3 adapter. The key is optional at wiring time and required only when a
 * price is actually read; missing config fails pre-HTTP, so tool discovery never breaks.
 * @param {{ baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: import("./jupiter-api.js").Fetch }} config
 */
export const JupiterPriceLive = (config) =>
  Layer.effect(
    PriceFeed,
    Effect.succeed({
      source: SOURCE,
      getPrice: (mint) => {
        const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const { apiKey } = config;
        if (!apiKey?.trim()) {
          return Effect.fail(
            new PriceConfigMissing({
              reason: "JUPITER_API_KEY is not set; export it to use Jupiter prices",
            }),
          );
        }
        return Effect.tryPromise({
          try: () =>
            jupiterPrice(
              { baseUrl: config.baseUrl, apiKey, timeoutMs, fetchImpl: config.fetchImpl },
              mint,
            ),
          catch: (error) =>
            isDeadlineAbort(error)
              ? new PriceTimeout({ timeoutMs })
              : new PriceNetworkError({ reason: "Jupiter price request failed" }),
        }).pipe(Effect.flatMap((outcome) => fromOutcome(outcome, mint)));
      },
    }),
  );
