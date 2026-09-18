// @ts-check
import {
  NoRouteFound,
  QuoteAuthFailed,
  QuoteHttpError,
  QuoteNetworkError,
  QuoteRateLimited,
  QuoteResponseInvalid,
  QuoteTimeout,
} from "@solos/core";
import { Effect } from "effect";
import { isDeadlineAbort } from "../market/elfa-api.js";
import { DEFAULT_TIMEOUT_MS, jupiterSwapOrder } from "./jupiter-swap-api.js";
import { PROVIDER, QuoteEnvelopeSchema, toSwapQuote } from "./jupiter-swap-quote.js";
import { routeRejection } from "./jupiter-swap-route.js";
import { envelopeRejection } from "./jupiter-swap-validate.js";

/**
 * Response mapping for the Jupiter Swap V2 quote-only endpoint: one transport outcome becomes
 * a SwapQuote or a slice-owned error. The documented no-route 400 body is the only message the
 * adapter matches; every other body stays redacted. Raw bodies and the API key never become
 * error props; only the HTTP status and a short fixed reason travel. An empty route plan is
 * the structural no-route case; a non-empty one must pass the route contract.
 */

/** The one documented no-route 400 message; no structural proxy exists on a 400. */
const NO_ROUTE_MESSAGE = "Failed to get quotes";

/** @param {string} body @returns {unknown} */
const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isJsonObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** @param {string} body */
const isNoRouteBody = (body) => {
  const parsed = parseJson(body);
  return isJsonObject(parsed) && parsed.error === NO_ROUTE_MESSAGE;
};

/**
 * Non-2xx status to the slice error, or undefined for 2xx.
 * @param {import("./jupiter-swap-api.js").JupiterSwapOutcome} outcome
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @returns {import("@solos/core").SwapQuoteError | undefined}
 */
const statusError = (outcome, request) => {
  if (outcome.status === 401 || outcome.status === 403)
    return new QuoteAuthFailed({ status: outcome.status });
  if (outcome.status === 429) return new QuoteRateLimited({ status: outcome.status });
  if (outcome.status < 200 || outcome.status >= 300) {
    if (outcome.status === 400 && isNoRouteBody(outcome.body)) {
      return new NoRouteFound({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        provider: PROVIDER,
      });
    }
    return new QuoteHttpError({
      status: outcome.status,
      reason: `Jupiter answered with HTTP ${outcome.status}`,
    });
  }
  return undefined;
};

/** @param {number} status @param {string} reason */
const invalid = (status, reason) => new QuoteResponseInvalid({ status, reason });

/**
 * Translate one outcome into a SwapQuote or a slice-owned error.
 * @param {import("./jupiter-swap-api.js").JupiterSwapOutcome} outcome
 * @param {import("@solos/core").SwapQuoteRequest} request
 */
const fromOutcome = (outcome, request) => {
  const failed = statusError(outcome, request);
  if (failed) return Effect.fail(failed);
  const parsed = parseJson(outcome.body);
  if (!isJsonObject(parsed))
    return Effect.fail(invalid(outcome.status, "response was not a JSON object"));
  const envelope = QuoteEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return Effect.fail(
      invalid(outcome.status, "response did not match the documented quote envelope"),
    );
  }
  const envelopeReason = envelopeRejection(envelope.data, request);
  if (envelopeReason) return Effect.fail(invalid(outcome.status, envelopeReason));
  if (envelope.data.routePlan.length === 0) {
    return Effect.fail(
      new NoRouteFound({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        provider: PROVIDER,
      }),
    );
  }
  const routeReason = routeRejection(envelope.data);
  if (routeReason) return Effect.fail(invalid(outcome.status, routeReason));
  return Effect.succeed(toSwapQuote(envelope.data, request));
};

/**
 * One quote-only order fetch through the transport, translated to the slice error channel.
 * Single attempt: a deadline abort is a QuoteTimeout and any other transport failure a
 * QuoteNetworkError — neither is retried.
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @param {import("./jupiter-swap-api.js").JupiterSwapConfig} config
 */
export const fetchQuote = (request, config) => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Effect.tryPromise({
    try: () => jupiterSwapOrder(config, request),
    catch: (error) =>
      isDeadlineAbort(error)
        ? new QuoteTimeout({ timeoutMs })
        : new QuoteNetworkError({ reason: "Jupiter swap quote request failed" }),
  }).pipe(Effect.flatMap((outcome) => fromOutcome(outcome, request)));
};
